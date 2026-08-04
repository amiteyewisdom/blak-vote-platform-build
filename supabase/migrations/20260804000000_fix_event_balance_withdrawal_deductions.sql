-- =============================================================================
-- Migration: Fix per-event balance deduction for organizer withdrawals
--
-- Issue:
--   process_organizer_withdrawal() was reducing organizer_wallets balances and
--   creating the withdrawal record, but it never updated the per-event
--   organizer_event_earnings.withdrawn_* columns. As a result, paid withdrawals
--   were not reflected in the admin event list's "available withdrawal balance".
--
-- Fix:
--   1. process_organizer_withdrawal() now also credits the withdrawal amount to
--      the relevant event's withdrawn_vote_revenue or withdrawn_ticket_revenue.
--   2. reverse_organizer_withdrawal() now reverses that per-event deduction when
--      a pending/approved withdrawal is rejected or cancelled.
--   3. Backfill existing processed/pending withdrawals and recompute all event
--      earnings so historical data is consistent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Recreate process_organizer_withdrawal with per-event balance update
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS process_organizer_withdrawal(UUID, NUMERIC, TEXT, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION process_organizer_withdrawal(
  p_organizer_id    UUID,
  p_amount          NUMERIC,
  p_method          TEXT,
  p_account_details JSONB,
  p_event_id        TEXT   DEFAULT NULL,
  p_withdrawal_type TEXT   DEFAULT 'combined'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_withdrawable  NUMERIC;
  v_withdrawal_id BIGINT;
  v_event_id      TEXT;
  v_amount        NUMERIC;
  v_withdrawal_type TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  v_amount := ROUND(p_amount, 2);

  -- Row-level lock — serialises concurrent withdrawal requests for the same organizer.
  SELECT withdrawable_balance
  INTO   v_withdrawable
  FROM   organizer_wallets
  WHERE  organizer_id = p_organizer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organizer wallet not found for organizer %', p_organizer_id;
  END IF;

  IF v_withdrawable < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: GHS %, Requested: GHS %',
      ROUND(v_withdrawable, 2), v_amount;
  END IF;

  v_event_id := NULLIF(TRIM(COALESCE(p_event_id, '')), '');
  v_withdrawal_type := COALESCE(NULLIF(TRIM(p_withdrawal_type), ''), 'combined');

  INSERT INTO organizer_withdrawals (
    organizer_id,
    amount_requested, platform_fee_percent, platform_fee_amount, net_amount,
    method, account_details,
    status, withdrawal_type, event_id,
    requested_at, created_at, updated_at
  ) VALUES (
    p_organizer_id,
    v_amount, 0, 0, v_amount,
    COALESCE(NULLIF(TRIM(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    v_withdrawal_type,
    v_event_id,
    timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
  )
  RETURNING id INTO v_withdrawal_id;

  -- Atomic deduction: organizer-level balance is reduced the moment the request is created.
  UPDATE organizer_wallets SET
    withdrawable_balance = withdrawable_balance - v_amount,
    pending_balance      = pending_balance      + v_amount,
    total_withdrawn      = total_withdrawn      + v_amount,
    last_updated         = timezone('utc', now())
  WHERE organizer_id = p_organizer_id;

  -- Per-event deduction: keep event-level earnings in sync with the wallet.
  -- The mapping mirrors recalculate_revenue_state() and buildOrganizerEventMetrics():
  --   'vote'      -> withdrawn_vote_revenue
  --   'combined'  -> withdrawn_vote_revenue (legacy combined bucket)
  --   'ticket'    -> withdrawn_ticket_revenue
  IF v_event_id IS NOT NULL THEN
    IF v_withdrawal_type = 'ticket' THEN
      UPDATE organizer_event_earnings SET
        withdrawn_ticket_revenue = COALESCE(withdrawn_ticket_revenue, 0) + v_amount,
        updated_at                 = timezone('utc', now())
      WHERE organizer_id = p_organizer_id
        AND event_id     = v_event_id;
    ELSE
      UPDATE organizer_event_earnings SET
        withdrawn_vote_revenue = COALESCE(withdrawn_vote_revenue, 0) + v_amount,
        updated_at             = timezone('utc', now())
      WHERE organizer_id = p_organizer_id
        AND event_id     = v_event_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'withdrawal_id',            v_withdrawal_id,
    'amount',                   v_amount,
    'new_withdrawable_balance', ROUND(v_withdrawable - v_amount, 2),
    'status',                   'pending'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Recreate reverse_organizer_withdrawal with per-event balance reversal
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS reverse_organizer_withdrawal(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION reverse_organizer_withdrawal(
  p_withdrawal_id BIGINT,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_row organizer_withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM   organizer_withdrawals
  WHERE  id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal % not found', p_withdrawal_id;
  END IF;

  IF v_row.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION
      'Cannot reverse withdrawal % — current status is "%" (must be pending or approved)',
      p_withdrawal_id, v_row.status;
  END IF;

  UPDATE organizer_withdrawals SET
    status     = 'rejected',
    admin_note = COALESCE(NULLIF(TRIM(p_reason), ''), admin_note),
    updated_at = timezone('utc', now())
  WHERE id = p_withdrawal_id;

  -- Restore organizer-level balance.
  UPDATE organizer_wallets SET
    withdrawable_balance = withdrawable_balance + v_row.amount_requested,
    pending_balance      = GREATEST(pending_balance - v_row.amount_requested, 0),
    total_withdrawn      = GREATEST(total_withdrawn - v_row.amount_requested, 0),
    last_updated         = timezone('utc', now())
  WHERE organizer_id = v_row.organizer_id;

  -- Reverse the per-event deduction if this withdrawal was tied to a specific event.
  IF v_row.event_id IS NOT NULL THEN
    IF v_row.withdrawal_type = 'ticket' THEN
      UPDATE organizer_event_earnings SET
        withdrawn_ticket_revenue = GREATEST(COALESCE(withdrawn_ticket_revenue, 0) - v_row.amount_requested, 0),
        updated_at                 = timezone('utc', now())
      WHERE organizer_id = v_row.organizer_id
        AND event_id     = v_row.event_id;
    ELSE
      UPDATE organizer_event_earnings SET
        withdrawn_vote_revenue = GREATEST(COALESCE(withdrawn_vote_revenue, 0) - v_row.amount_requested, 0),
        updated_at             = timezone('utc', now())
      WHERE organizer_id = v_row.organizer_id
        AND event_id     = v_row.event_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'reversed',      true,
    'withdrawal_id', p_withdrawal_id,
    'amount',        v_row.amount_requested,
    'organizer_id',  v_row.organizer_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Backfill + reconcile historical event earnings
--
--    recalculate_revenue_state() recomputes all event revenue and the withdrawn
--    buckets directly from organizer_withdrawals, so running it once makes the
--    per-event balances consistent with the organizer wallet ledger.
-- -----------------------------------------------------------------------------
SELECT recalculate_revenue_state();
