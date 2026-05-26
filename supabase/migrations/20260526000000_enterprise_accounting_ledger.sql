-- =============================================================================
-- Migration: Enterprise Accounting Ledger
--
-- Implements:
--   1.  Unique constraint on admin_revenue_transactions.payment_id (idempotency)
--   2.  New stored columns on organizer_wallets
--         voting_earnings, ticket_earnings, total_earnings
--         withdrawable_balance, pending_balance, total_withdrawn
--   3.  admin_platform_wallet  — singleton tracking platform's share
--   4.  record_payment_split() — atomic, idempotent split on confirmed payment
--   5.  process_organizer_withdrawal() — atomic withdrawal with row-level lock
--   6.  reverse_organizer_withdrawal() — rollback on rejection / cancellation
--   7.  mark_organizer_withdrawal_processed() — pending→processed bookkeeping
--   8.  sync_organizer_wallet_from_ledger() — full reconciliation helper
--   9.  sync_admin_platform_wallet_from_ledger() — admin-side reconciliation
--   10. Backfill of all new columns from existing ledger data
--   11. Performance indexes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure admin_revenue_transactions.payment_id is unique (idempotency guard)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname     = 'admin_revenue_transactions_payment_id_key'
      AND  conrelid    = 'admin_revenue_transactions'::regclass
  ) THEN
    ALTER TABLE admin_revenue_transactions
      ADD CONSTRAINT admin_revenue_transactions_payment_id_key UNIQUE (payment_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- constraint already exists under another name; skip
END $$;

-- -----------------------------------------------------------------------------
-- 2. Extend organizer_wallets with enterprise accounting columns
-- -----------------------------------------------------------------------------
ALTER TABLE organizer_wallets
  ADD COLUMN IF NOT EXISTS voting_earnings      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_earnings      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earnings       NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawable_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_balance      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn      NUMERIC(15, 2) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 3. Admin platform wallet — singleton row (id = 1 enforced by CHECK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_platform_wallet (
  id                       INT            NOT NULL DEFAULT 1 PRIMARY KEY,
  platform_voting_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0,
  platform_ticket_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_platform_earnings  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  last_updated             TIMESTAMPTZ    NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT admin_platform_wallet_singleton CHECK (id = 1)
);
INSERT INTO admin_platform_wallet (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. record_payment_split
--    Atomically records a confirmed payment's split across every accounting
--    table in a single database transaction.
--    IDEMPOTENT: safe to retry — subsequent calls with the same payment_id
--    return {already_recorded: true} without touching any row.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS record_payment_split(TEXT,TEXT,TEXT,UUID,NUMERIC,TEXT,NUMERIC,TEXT,TEXT,TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION record_payment_split(
  p_payment_id        TEXT,
  p_payment_reference TEXT,
  p_event_id          TEXT,
  p_organizer_id      UUID,
  p_gross_amount      NUMERIC,
  p_payment_context   TEXT,          -- 'vote' or 'ticket'
  p_fee_percent       NUMERIC,       -- e.g. 15.00  (percentage, NOT decimal)
  p_vote_id           TEXT          DEFAULT NULL,
  p_provider          TEXT          DEFAULT 'paystack',
  p_processed_at      TIMESTAMPTZ   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_fee_amount       NUMERIC;
  v_organizer_amount NUMERIC;
  v_event_title      TEXT;
  v_ts               TIMESTAMPTZ;
BEGIN
  -- ── Idempotency guard ────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM admin_revenue_transactions WHERE payment_id = p_payment_id
  ) THEN
    RETURN jsonb_build_object('already_recorded', true, 'payment_id', p_payment_id);
  END IF;

  -- ── Validation ───────────────────────────────────────────────────────────
  IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'record_payment_split: gross_amount must be positive (got %)', p_gross_amount;
  END IF;
  IF p_payment_context NOT IN ('vote', 'ticket') THEN
    RAISE EXCEPTION 'record_payment_split: invalid payment_context "%"', p_payment_context;
  END IF;
  IF p_organizer_id IS NULL THEN
    RAISE EXCEPTION 'record_payment_split: organizer_id is required';
  END IF;

  -- ── Calculate split ──────────────────────────────────────────────────────
  v_fee_amount       := ROUND((p_gross_amount * GREATEST(COALESCE(p_fee_percent, 0), 0)) / 100, 2);
  v_organizer_amount := ROUND(p_gross_amount - v_fee_amount, 2);
  v_ts               := COALESCE(p_processed_at, timezone('utc', now()));

  SELECT title INTO v_event_title FROM events WHERE id = p_event_id LIMIT 1;

  -- ── Step 1 · Admin revenue ledger (source of truth for the split) ────────
  INSERT INTO admin_revenue_transactions (
    payment_id, payment_reference, event_id, event_title, organizer_id,
    vote_id, vote_type, payment_context, payment_provider,
    gross_amount, platform_fee_percent, platform_fee_amount, organizer_net_amount,
    processed_at
  ) VALUES (
    p_payment_id,
    p_payment_reference,
    p_event_id,
    v_event_title,
    p_organizer_id,
    CASE WHEN p_payment_context = 'vote' THEN p_vote_id ELSE NULL END,
    'paid',
    p_payment_context,
    COALESCE(NULLIF(TRIM(p_provider), ''), 'paystack'),
    ROUND(p_gross_amount, 2),
    ROUND(COALESCE(p_fee_percent, 0), 2),
    v_fee_amount,
    v_organizer_amount,
    v_ts
  )
  ON CONFLICT (payment_id) DO NOTHING;

  -- Race-condition guard: if another concurrent call beat us to the INSERT.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_recorded', true, 'payment_id', p_payment_id);
  END IF;

  -- ── Step 2 · Organizer wallet — atomic incremental update ────────────────
  INSERT INTO organizer_wallets (
    organizer_id,
    total_revenue,
    vote_revenue,         ticket_revenue,
    total_paid_votes,     paid_ticket_count,
    manual_votes,
    vote_platform_fees_deducted,
    ticket_platform_fees_deducted,
    platform_fees_deducted,
    net_balance,
    voting_earnings,      ticket_earnings,      total_earnings,
    withdrawable_balance,
    pending_balance,      total_withdrawn,
    transferable_balance,
    last_updated
  ) VALUES (
    p_organizer_id,
    p_gross_amount,
    CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount      ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount      ELSE 0 END,
    CASE WHEN p_payment_context = 'vote'   THEN 1                   ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN 1                   ELSE 0 END,
    0,
    CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount        ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount        ELSE 0 END,
    v_fee_amount,
    v_organizer_amount,
    CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount  ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount  ELSE 0 END,
    v_organizer_amount,
    v_organizer_amount,  -- withdrawable_balance starts equal to net earnings
    0,                   -- pending_balance: no withdrawal yet
    0,                   -- total_withdrawn: no withdrawal yet
    0,                   -- transferable_balance
    v_ts
  )
  ON CONFLICT (organizer_id) DO UPDATE SET
    total_revenue     = organizer_wallets.total_revenue     + p_gross_amount,
    vote_revenue      = organizer_wallets.vote_revenue
                        + CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount ELSE 0 END,
    ticket_revenue    = organizer_wallets.ticket_revenue
                        + CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount ELSE 0 END,
    total_paid_votes  = organizer_wallets.total_paid_votes
                        + CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    paid_ticket_count = organizer_wallets.paid_ticket_count
                        + CASE WHEN p_payment_context = 'ticket' THEN 1 ELSE 0 END,
    vote_platform_fees_deducted   = organizer_wallets.vote_platform_fees_deducted
                        + CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    ticket_platform_fees_deducted = organizer_wallets.ticket_platform_fees_deducted
                        + CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    platform_fees_deducted = organizer_wallets.platform_fees_deducted + v_fee_amount,
    net_balance            = organizer_wallets.net_balance + v_organizer_amount,
    voting_earnings        = organizer_wallets.voting_earnings
                        + CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    ticket_earnings        = organizer_wallets.ticket_earnings
                        + CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    total_earnings         = organizer_wallets.total_earnings + v_organizer_amount,
    withdrawable_balance   = organizer_wallets.withdrawable_balance + v_organizer_amount,
    last_updated           = GREATEST(organizer_wallets.last_updated, v_ts);

  -- ── Step 3 · Per-event earnings — atomic incremental update ──────────────
  INSERT INTO organizer_event_earnings (
    organizer_id, event_id,
    total_votes, paid_votes, paid_ticket_count,
    vote_revenue, ticket_revenue, total_revenue,
    platform_fee_percent, platform_fee_deducted,
    vote_platform_fee_deducted, ticket_platform_fee_deducted,
    net_earnings, vote_net_earnings, ticket_net_earnings,
    updated_at
  ) VALUES (
    p_organizer_id, p_event_id,
    CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN 1 ELSE 0 END,
    CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount ELSE 0 END,
    p_gross_amount,
    ROUND(COALESCE(p_fee_percent, 0), 2),
    v_fee_amount,
    CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    v_organizer_amount,
    CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    v_ts
  )
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes       = organizer_event_earnings.total_votes
                        + CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    paid_votes        = organizer_event_earnings.paid_votes
                        + CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    paid_ticket_count = organizer_event_earnings.paid_ticket_count
                        + CASE WHEN p_payment_context = 'ticket' THEN 1 ELSE 0 END,
    vote_revenue      = organizer_event_earnings.vote_revenue
                        + CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount ELSE 0 END,
    ticket_revenue    = organizer_event_earnings.ticket_revenue
                        + CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount ELSE 0 END,
    total_revenue     = organizer_event_earnings.total_revenue + p_gross_amount,
    platform_fee_deducted = organizer_event_earnings.platform_fee_deducted + v_fee_amount,
    vote_platform_fee_deducted = organizer_event_earnings.vote_platform_fee_deducted
                        + CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    ticket_platform_fee_deducted = organizer_event_earnings.ticket_platform_fee_deducted
                        + CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    net_earnings      = organizer_event_earnings.net_earnings + v_organizer_amount,
    vote_net_earnings = organizer_event_earnings.vote_net_earnings
                        + CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    ticket_net_earnings = organizer_event_earnings.ticket_net_earnings
                        + CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    updated_at        = GREATEST(organizer_event_earnings.updated_at, v_ts);

  -- ── Step 4 · Admin platform wallet — atomic incremental update ───────────
  UPDATE admin_platform_wallet SET
    platform_voting_earnings = platform_voting_earnings
                        + CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    platform_ticket_earnings = platform_ticket_earnings
                        + CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    total_platform_earnings  = total_platform_earnings + v_fee_amount,
    last_updated             = GREATEST(last_updated, v_ts)
  WHERE id = 1;

  RETURN jsonb_build_object(
    'recorded',              true,
    'payment_id',            p_payment_id,
    'gross_amount',          p_gross_amount,
    'platform_fee_percent',  COALESCE(p_fee_percent, 0),
    'platform_fee_amount',   v_fee_amount,
    'organizer_amount',      v_organizer_amount,
    'payment_context',       p_payment_context
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. process_organizer_withdrawal
--    Validates balance using a SELECT FOR UPDATE row lock (prevents overdraft
--    under concurrent withdrawal requests), creates the withdrawal record, and
--    atomically deducts from withdrawable_balance.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS process_organizer_withdrawal(UUID,NUMERIC,TEXT,JSONB,TEXT,TEXT);

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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  -- Row-level lock — serialises concurrent withdrawal requests for the same organizer.
  SELECT withdrawable_balance
  INTO   v_withdrawable
  FROM   organizer_wallets
  WHERE  organizer_id = p_organizer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organizer wallet not found for organizer %', p_organizer_id;
  END IF;

  IF v_withdrawable < ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'Insufficient balance. Available: GHS %, Requested: GHS %',
      ROUND(v_withdrawable, 2), ROUND(p_amount, 2);
  END IF;

  INSERT INTO organizer_withdrawals (
    organizer_id,
    amount_requested, platform_fee_percent, platform_fee_amount, net_amount,
    method, account_details,
    status, withdrawal_type, event_id,
    requested_at, created_at, updated_at
  ) VALUES (
    p_organizer_id,
    ROUND(p_amount, 2), 0, 0, ROUND(p_amount, 2),
    COALESCE(NULLIF(TRIM(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    COALESCE(NULLIF(TRIM(p_withdrawal_type), ''), 'combined'),
    NULLIF(TRIM(COALESCE(p_event_id, '')), ''),
    timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
  )
  RETURNING id INTO v_withdrawal_id;

  -- Atomic deduction: balance is reduced the moment the request is created.
  UPDATE organizer_wallets SET
    withdrawable_balance = withdrawable_balance - ROUND(p_amount, 2),
    pending_balance      = pending_balance      + ROUND(p_amount, 2),
    total_withdrawn      = total_withdrawn      + ROUND(p_amount, 2),
    last_updated         = timezone('utc', now())
  WHERE organizer_id = p_organizer_id;

  RETURN jsonb_build_object(
    'withdrawal_id',            v_withdrawal_id,
    'amount',                   ROUND(p_amount, 2),
    'new_withdrawable_balance', ROUND(v_withdrawable - p_amount, 2),
    'status',                   'pending'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. reverse_organizer_withdrawal
--    Called when a withdrawal is rejected or cancelled.
--    Restores withdrawable_balance and rolls back total_withdrawn.
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

  -- Restore balance.
  UPDATE organizer_wallets SET
    withdrawable_balance = withdrawable_balance + v_row.amount_requested,
    pending_balance      = GREATEST(pending_balance  - v_row.amount_requested, 0),
    total_withdrawn      = GREATEST(total_withdrawn  - v_row.amount_requested, 0),
    last_updated         = timezone('utc', now())
  WHERE organizer_id = v_row.organizer_id;

  RETURN jsonb_build_object(
    'reversed',      true,
    'withdrawal_id', p_withdrawal_id,
    'amount',        v_row.amount_requested,
    'organizer_id',  v_row.organizer_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. mark_organizer_withdrawal_processed
--    Moves a withdrawal from pending/approved → processed and releases it
--    from pending_balance (it has already been deducted from withdrawable).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS mark_organizer_withdrawal_processed(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION mark_organizer_withdrawal_processed(
  p_withdrawal_id BIGINT,
  p_payout_ref    TEXT DEFAULT NULL
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
      'Cannot mark withdrawal % as processed — current status is "%"',
      p_withdrawal_id, v_row.status;
  END IF;

  UPDATE organizer_withdrawals SET
    status           = 'processed',
    processed_at     = timezone('utc', now()),
    payout_reference = COALESCE(p_payout_ref, payout_reference),
    updated_at       = timezone('utc', now())
  WHERE id = p_withdrawal_id;

  -- Release from pending_balance (withdrawable was already reduced on creation).
  UPDATE organizer_wallets SET
    pending_balance = GREATEST(pending_balance - v_row.amount_requested, 0),
    last_updated    = timezone('utc', now())
  WHERE organizer_id = v_row.organizer_id;

  RETURN jsonb_build_object(
    'processed',     true,
    'withdrawal_id', p_withdrawal_id,
    'amount',        v_row.amount_requested,
    'payout_ref',    p_payout_ref
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. sync_organizer_wallet_from_ledger  (reconciliation)
--    Full recompute of every organizer_wallets row from admin_revenue_transactions
--    and organizer_withdrawals.  Safe to run at any time; idempotent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_organizer_wallet_from_ledger()
RETURNS TABLE(
  organizer_id         UUID,
  voting_earnings      NUMERIC,
  ticket_earnings      NUMERIC,
  withdrawable_balance NUMERIC
)
LANGUAGE sql
AS $$
  WITH revenue_agg AS (
    SELECT
      art.organizer_id,
      COALESCE(SUM(art.gross_amount),                                                          0) AS total_revenue,
      COALESCE(SUM(CASE WHEN art.payment_context = 'vote'   THEN art.gross_amount       ELSE 0 END), 0) AS vote_revenue,
      COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.gross_amount       ELSE 0 END), 0) AS ticket_revenue,
      COALESCE(SUM(art.platform_fee_amount),                                              0) AS platform_fees_deducted,
      COALESCE(SUM(CASE WHEN art.payment_context = 'vote'   THEN art.platform_fee_amount ELSE 0 END), 0) AS vote_fees,
      COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.platform_fee_amount ELSE 0 END), 0) AS ticket_fees,
      COALESCE(SUM(art.organizer_net_amount),                                             0) AS net_balance,
      COALESCE(SUM(CASE WHEN art.payment_context = 'vote'   THEN art.organizer_net_amount ELSE 0 END), 0) AS voting_earnings,
      COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.organizer_net_amount ELSE 0 END), 0) AS ticket_earnings,
      COUNT(CASE WHEN art.payment_context = 'vote'   THEN 1 END)::BIGINT AS total_paid_votes,
      COUNT(CASE WHEN art.payment_context = 'ticket' THEN 1 END)::BIGINT AS paid_ticket_count
    FROM admin_revenue_transactions art
    WHERE art.organizer_id IS NOT NULL
    GROUP BY art.organizer_id
  ),
  withdrawal_agg AS (
    SELECT
      ow.organizer_id,
      COALESCE(SUM(CASE WHEN ow.status IN ('pending', 'approved')
                        THEN ow.amount_requested ELSE 0 END), 0) AS pending_balance,
      COALESCE(SUM(CASE WHEN ow.status NOT IN ('cancelled', 'rejected')
                        THEN ow.amount_requested ELSE 0 END), 0) AS total_withdrawn
    FROM organizer_withdrawals ow
    GROUP BY ow.organizer_id
  ),
  transferable AS (
    SELECT organizer_id, COALESCE(transferable_balance, 0) AS transferable_balance
    FROM organizer_wallets
  )
  UPDATE organizer_wallets ow
  SET
    total_revenue                 = COALESCE(ra.total_revenue,          0),
    vote_revenue                  = COALESCE(ra.vote_revenue,           0),
    ticket_revenue                = COALESCE(ra.ticket_revenue,         0),
    platform_fees_deducted        = COALESCE(ra.platform_fees_deducted, 0),
    vote_platform_fees_deducted   = COALESCE(ra.vote_fees,              0),
    ticket_platform_fees_deducted = COALESCE(ra.ticket_fees,            0),
    net_balance                   = COALESCE(ra.net_balance,            0),
    voting_earnings               = COALESCE(ra.voting_earnings,        0),
    ticket_earnings               = COALESCE(ra.ticket_earnings,        0),
    total_earnings                = COALESCE(ra.net_balance,            0),
    total_paid_votes              = COALESCE(ra.total_paid_votes,       0),
    paid_ticket_count             = COALESCE(ra.paid_ticket_count,      0),
    pending_balance               = COALESCE(wa.pending_balance,        0),
    total_withdrawn               = COALESCE(wa.total_withdrawn,        0),
    withdrawable_balance          = GREATEST(
                                      COALESCE(ra.net_balance, 0)
                                      + COALESCE(tr.transferable_balance, 0)
                                      - COALESCE(wa.pending_balance, 0),
                                      0
                                    ),
    last_updated                  = timezone('utc', now())
  FROM revenue_agg ra
  LEFT JOIN withdrawal_agg wa ON wa.organizer_id = ra.organizer_id
  LEFT JOIN transferable   tr ON tr.organizer_id = ra.organizer_id
  WHERE ow.organizer_id = ra.organizer_id
  RETURNING ow.organizer_id, ow.voting_earnings, ow.ticket_earnings, ow.withdrawable_balance;
$$;

-- -----------------------------------------------------------------------------
-- 9. sync_admin_platform_wallet_from_ledger  (admin-side reconciliation)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_admin_platform_wallet_from_ledger()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO admin_platform_wallet (
    id,
    platform_voting_earnings, platform_ticket_earnings, total_platform_earnings,
    last_updated
  )
  SELECT
    1,
    COALESCE(SUM(CASE WHEN payment_context = 'vote'   THEN platform_fee_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0),
    COALESCE(SUM(platform_fee_amount), 0),
    timezone('utc', now())
  FROM admin_revenue_transactions
  ON CONFLICT (id) DO UPDATE SET
    platform_voting_earnings = EXCLUDED.platform_voting_earnings,
    platform_ticket_earnings = EXCLUDED.platform_ticket_earnings,
    total_platform_earnings  = EXCLUDED.total_platform_earnings,
    last_updated             = EXCLUDED.last_updated;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Backfill — populate new columns from existing ledger data
-- -----------------------------------------------------------------------------
SELECT sync_organizer_wallet_from_ledger();
SELECT sync_admin_platform_wallet_from_ledger();

-- -----------------------------------------------------------------------------
-- 11. Performance indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_admin_revenue_transactions_organizer_context
  ON admin_revenue_transactions (organizer_id, payment_context, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_wallets_withdrawable
  ON organizer_wallets (organizer_id, withdrawable_balance);

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_status_organizer
  ON organizer_withdrawals (organizer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_event_status
  ON organizer_withdrawals (event_id, status)
  WHERE event_id IS NOT NULL;
