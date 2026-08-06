-- =============================================================================
-- Migration: Fix provider-fee accounting model
--
-- Problem: provider fees were being deducted from the organizer's net payout,
-- so the organizer ended up with more than 90% of gross. The platform fee
-- should be the full configured fee, and the provider fee should reduce the
-- platform's profit, not the organizer's payout.
--
-- Fix:
--   1. Add provider_fee_amount to admin_revenue_transactions.
--   2. Recompute existing rows: platform_fee_amount = full fee, organizer_net =
--      gross - full fee, provider_fee_amount = provider charge.
--   3. Add provider_fee_deducted to organizer_event_earnings.
--   4. Rebuild recalculate_revenue_state() so it:
--        - Normalizes oee.organizer_id so existing rows are always updated.
--        - Uses the full platform fee for net_earnings.
--        - Tracks provider_fee_deducted separately.
-- =============================================================================

-- 1. Add provider fee column to the ledger.
ALTER TABLE admin_revenue_transactions
  ADD COLUMN IF NOT EXISTS provider_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 2. Recompute existing ledger rows to the correct model.
--    Current rows store the *net* platform fee percent (after provider deduction).
--    We add the provider fee back to get the nominal fee, then recompute amounts.
WITH settings AS (
  SELECT
    COALESCE(paystack_fee_percent, 1.95) AS paystack_fee,
    COALESCE(nalo_fee_percent, 2.00)     AS nalo_fee
  FROM platform_settings
  LIMIT 1
)
UPDATE admin_revenue_transactions art
SET
  provider_fee_amount = (art.gross_amount * CASE
    WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
    ELSE s.paystack_fee
  END / 100)::NUMERIC(12, 2),
  platform_fee_percent = GREATEST(art.platform_fee_percent + CASE
    WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
    ELSE s.paystack_fee
  END, 0),
  platform_fee_amount = (art.gross_amount * GREATEST(art.platform_fee_percent + CASE
    WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
    ELSE s.paystack_fee
  END, 0) / 100)::NUMERIC(12, 2)
FROM settings s
WHERE art.gross_amount > 0 AND art.provider_fee_amount = 0;

-- Recompute organizer_net_amount from the corrected full platform fee.
UPDATE admin_revenue_transactions
SET organizer_net_amount = GREATEST(gross_amount - platform_fee_amount, 0)
WHERE gross_amount > 0 AND provider_fee_amount > 0;

-- 3. Add provider fee column to per-event earnings.
ALTER TABLE organizer_event_earnings
  ADD COLUMN IF NOT EXISTS provider_fee_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 4. Rebuild recalculate_revenue_state() with correct model and id normalization.
CREATE OR REPLACE FUNCTION recalculate_revenue_state()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Rebuild per-event earnings from scratch for active events. This avoids stale
  -- rows with mismatched organizer_id values and guarantees every event is
  -- fully recomputed from the source tables.
  DELETE FROM organizer_event_earnings
  WHERE event_id IN (
    SELECT id::TEXT FROM events WHERE status::TEXT NOT IN ('deleted', 'cancelled')
  );

  WITH active_events AS (
    SELECT DISTINCT COALESCE(o.user_id, e.organizer_id) AS organizer_id, e.id::TEXT AS event_id
    FROM events e
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
  ),
  vote_metrics AS (
    SELECT
      COALESCE(o.user_id, e.organizer_id) AS organizer_id,
      v.event_id::TEXT AS event_id,
      COALESCE(SUM(v.quantity), 0)::BIGINT AS total_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.quantity ELSE 0 END), 0)::BIGINT AS paid_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'free' THEN v.quantity ELSE 0 END), 0)::BIGINT AS free_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'manual' THEN v.quantity ELSE 0 END), 0)::BIGINT AS manual_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.amount_paid ELSE 0 END), 0) AS vote_revenue
    FROM votes v
    JOIN events e ON e.id::TEXT = v.event_id::TEXT
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY COALESCE(o.user_id, e.organizer_id), v.event_id::TEXT
  ),
  ticket_metrics AS (
    SELECT
      COALESCE(o.user_id, e.organizer_id) AS organizer_id,
      t.event_id::TEXT AS event_id,
      COUNT(*)::BIGINT AS paid_ticket_count,
      COALESCE(SUM(CASE WHEN p.status IN ('processed', 'success', 'paid') THEN p.amount ELSE 0 END), 0) AS ticket_revenue
    FROM tickets t
    JOIN events e ON e.id::TEXT = t.event_id::TEXT
    LEFT JOIN payments p ON p.reference = t.payment_reference AND p.payment_context = 'ticket'
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE t.payment_reference IS NOT NULL
      AND e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY COALESCE(o.user_id, e.organizer_id), t.event_id::TEXT
  ),
  fee_metrics AS (
    SELECT
      organizer_id,
      event_id,
      COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN platform_fee_amount ELSE 0 END), 0) AS vote_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0) AS ticket_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN provider_fee_amount ELSE 0 END), 0) AS vote_provider_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN provider_fee_amount ELSE 0 END), 0) AS ticket_provider_fee
    FROM admin_revenue_transactions
    WHERE payment_context IN ('vote', 'ticket')
    GROUP BY organizer_id, event_id
  ),
  withdrawal_metrics AS (
    SELECT
      event_id,
      COALESCE(SUM(CASE WHEN withdrawal_type IN ('vote', 'combined') THEN amount_requested ELSE 0 END), 0) AS vote_wd,
      COALESCE(SUM(CASE WHEN withdrawal_type = 'ticket' THEN amount_requested ELSE 0 END), 0) AS ticket_wd
    FROM organizer_withdrawals
    WHERE status IN ('pending', 'approved', 'processed')
      AND event_id IS NOT NULL
    GROUP BY event_id
  ),
  computed AS (
    SELECT
      ae.organizer_id,
      ae.event_id,
      COALESCE(vm.total_votes, 0) AS total_votes,
      COALESCE(vm.paid_votes, 0) AS paid_votes,
      COALESCE(vm.free_votes, 0) AS free_votes,
      COALESCE(vm.manual_votes, 0) AS manual_votes,
      COALESCE(tm.paid_ticket_count, 0) AS paid_ticket_count,
      COALESCE(vm.vote_revenue, 0) AS vote_revenue,
      COALESCE(tm.ticket_revenue, 0) AS ticket_revenue,
      COALESCE(vm.vote_revenue, 0) + COALESCE(tm.ticket_revenue, 0) AS total_revenue,
      COALESCE(fm.vote_fee, 0) AS vote_fee,
      COALESCE(fm.ticket_fee, 0) AS ticket_fee,
      COALESCE(fm.vote_fee, 0) + COALESCE(fm.ticket_fee, 0) AS platform_fee_deducted,
      COALESCE(fm.vote_provider_fee, 0) + COALESCE(fm.ticket_provider_fee, 0) AS provider_fee_deducted,
      COALESCE(wm.vote_wd, 0) AS withdrawn_vote_revenue,
      COALESCE(wm.ticket_wd, 0) AS withdrawn_ticket_revenue
    FROM active_events ae
    LEFT JOIN vote_metrics vm
      ON vm.organizer_id = ae.organizer_id AND vm.event_id = ae.event_id
    LEFT JOIN ticket_metrics tm
      ON tm.organizer_id = ae.organizer_id AND tm.event_id = ae.event_id
    LEFT JOIN fee_metrics fm
      ON fm.organizer_id = ae.organizer_id AND fm.event_id = ae.event_id
    LEFT JOIN withdrawal_metrics wm
      ON wm.event_id = ae.event_id
  )
  INSERT INTO organizer_event_earnings (
    organizer_id, event_id,
    total_votes, paid_votes, free_votes, manual_votes, paid_ticket_count,
    vote_revenue, ticket_revenue, total_revenue,
    vote_platform_fee_deducted, ticket_platform_fee_deducted, platform_fee_deducted,
    provider_fee_deducted,
    vote_net_earnings, ticket_net_earnings, net_earnings,
    withdrawn_vote_revenue, withdrawn_ticket_revenue,
    updated_at
  )
  SELECT
    organizer_id, event_id,
    total_votes, paid_votes, free_votes, manual_votes, paid_ticket_count,
    vote_revenue, ticket_revenue, total_revenue,
    vote_fee, ticket_fee, platform_fee_deducted,
    provider_fee_deducted,
    vote_revenue - vote_fee, ticket_revenue - ticket_fee, total_revenue - platform_fee_deducted,
    withdrawn_vote_revenue, withdrawn_ticket_revenue,
    timezone('utc', now())
  FROM computed
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    paid_votes = EXCLUDED.paid_votes,
    free_votes = EXCLUDED.free_votes,
    manual_votes = EXCLUDED.manual_votes,
    paid_ticket_count = EXCLUDED.paid_ticket_count,
    vote_revenue = EXCLUDED.vote_revenue,
    ticket_revenue = EXCLUDED.ticket_revenue,
    total_revenue = EXCLUDED.total_revenue,
    vote_platform_fee_deducted = EXCLUDED.vote_platform_fee_deducted,
    ticket_platform_fee_deducted = EXCLUDED.ticket_platform_fee_deducted,
    platform_fee_deducted = EXCLUDED.platform_fee_deducted,
    provider_fee_deducted = EXCLUDED.provider_fee_deducted,
    vote_net_earnings = EXCLUDED.vote_net_earnings,
    ticket_net_earnings = EXCLUDED.ticket_net_earnings,
    net_earnings = EXCLUDED.net_earnings,
    withdrawn_vote_revenue = EXCLUDED.withdrawn_vote_revenue,
    withdrawn_ticket_revenue = EXCLUDED.withdrawn_ticket_revenue,
    updated_at = EXCLUDED.updated_at;

  -- Roll per-event revenue back up into organizer_wallets.
  UPDATE organizer_wallets ow
  SET
    vote_revenue = COALESCE(subq.vote_revenue, 0),
    ticket_revenue = COALESCE(subq.ticket_revenue, 0),
    total_revenue = COALESCE(subq.vote_revenue, 0) + COALESCE(subq.ticket_revenue, 0),
    total_paid_votes = COALESCE(subq.paid_votes, 0),
    paid_ticket_count = COALESCE(subq.paid_ticket_count, 0),
    manual_votes = COALESCE(subq.manual_votes, 0),
    vote_platform_fees_deducted = COALESCE(subq.vote_fee, 0),
    ticket_platform_fees_deducted = COALESCE(subq.ticket_fee, 0),
    platform_fees_deducted = COALESCE(subq.vote_fee, 0) + COALESCE(subq.ticket_fee, 0),
    net_balance = (COALESCE(subq.vote_revenue, 0) + COALESCE(subq.ticket_revenue, 0))
                - (COALESCE(subq.vote_fee, 0) + COALESCE(subq.ticket_fee, 0)),
    last_updated = timezone('utc', now())
  FROM (
    SELECT
      organizer_id,
      COALESCE(SUM(vote_revenue), 0) AS vote_revenue,
      COALESCE(SUM(ticket_revenue), 0) AS ticket_revenue,
      COALESCE(SUM(paid_votes), 0) AS paid_votes,
      COALESCE(SUM(paid_ticket_count), 0) AS paid_ticket_count,
      COALESCE(SUM(manual_votes), 0) AS manual_votes,
      COALESCE(SUM(vote_platform_fee_deducted), 0) AS vote_fee,
      COALESCE(SUM(ticket_platform_fee_deducted), 0) AS ticket_fee
    FROM organizer_event_earnings
    GROUP BY organizer_id
  ) subq
  WHERE ow.organizer_id = subq.organizer_id;
END;
$$;

-- 5. Backfill all event earnings and wallets with the corrected model.
SELECT recalculate_revenue_state();

-- 6. Update record_payment_split to accept and store the provider fee separately.
DROP FUNCTION IF EXISTS record_payment_split(TEXT,TEXT,TEXT,UUID,NUMERIC,TEXT,NUMERIC,TEXT,TEXT,TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION record_payment_split(
  p_payment_id        TEXT,
  p_payment_reference TEXT,
  p_event_id          TEXT,
  p_organizer_id      UUID,
  p_gross_amount      NUMERIC,
  p_payment_context   TEXT,
  p_fee_percent       NUMERIC,       -- nominal platform fee percent
  p_provider_fee_percent NUMERIC   DEFAULT 0,  -- provider service fee percent
  p_vote_id           TEXT          DEFAULT NULL,
  p_provider          TEXT          DEFAULT 'paystack',
  p_processed_at      TIMESTAMPTZ   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_fee_amount        NUMERIC;
  v_provider_fee_amount NUMERIC;
  v_organizer_amount  NUMERIC;
  v_event_title       TEXT;
  v_ts                TIMESTAMPTZ;
BEGIN
  IF EXISTS (
    SELECT 1 FROM admin_revenue_transactions WHERE payment_id = p_payment_id
  ) THEN
    RETURN jsonb_build_object('already_recorded', true, 'payment_id', p_payment_id);
  END IF;

  IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'record_payment_split: gross_amount must be positive (got %)', p_gross_amount;
  END IF;
  IF p_payment_context NOT IN ('vote', 'ticket') THEN
    RAISE EXCEPTION 'record_payment_split: invalid payment_context "%"', p_payment_context;
  END IF;
  IF p_organizer_id IS NULL THEN
    RAISE EXCEPTION 'record_payment_split: organizer_id is required';
  END IF;

  v_fee_amount         := ROUND((p_gross_amount * GREATEST(COALESCE(p_fee_percent, 0), 0)) / 100, 2);
  v_provider_fee_amount := ROUND((p_gross_amount * GREATEST(COALESCE(p_provider_fee_percent, 0), 0)) / 100, 2);
  v_organizer_amount   := ROUND(p_gross_amount - v_fee_amount, 2);
  v_ts                 := COALESCE(p_processed_at, timezone('utc', now()));

  SELECT title INTO v_event_title FROM events WHERE id = p_event_id LIMIT 1;

  INSERT INTO admin_revenue_transactions (
    payment_id, payment_reference, event_id, event_title, organizer_id,
    vote_id, vote_type, payment_context, payment_provider,
    gross_amount, platform_fee_percent, platform_fee_amount, provider_fee_amount, organizer_net_amount,
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
    v_provider_fee_amount,
    v_organizer_amount,
    v_ts
  )
  ON CONFLICT (payment_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_recorded', true, 'payment_id', p_payment_id);
  END IF;

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
    v_organizer_amount,
    0,
    0,
    0,
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
    voting_earnings          = organizer_wallets.voting_earnings
                        + CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    ticket_earnings          = organizer_wallets.ticket_earnings
                        + CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    total_earnings           = organizer_wallets.total_earnings + v_organizer_amount,
    withdrawable_balance     = organizer_wallets.withdrawable_balance + v_organizer_amount,
    last_updated             = v_ts;

  INSERT INTO organizer_event_earnings (
    organizer_id, event_id, total_votes, paid_votes, free_votes, manual_votes,
    paid_ticket_count,
    vote_revenue, ticket_revenue, total_revenue,
    vote_platform_fee_deducted, ticket_platform_fee_deducted, platform_fee_deducted,
    provider_fee_deducted,
    vote_net_earnings, ticket_net_earnings, net_earnings,
    withdrawn_vote_revenue, withdrawn_ticket_revenue,
    updated_at
  )
  VALUES (
    p_organizer_id,
    p_event_id,
    CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    CASE WHEN p_payment_context = 'vote'   THEN 1 ELSE 0 END,
    0,
    0,
    CASE WHEN p_payment_context = 'ticket' THEN 1 ELSE 0 END,
    CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount ELSE 0 END,
    p_gross_amount,
    CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    v_fee_amount,
    v_provider_fee_amount,
    CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    v_organizer_amount,
    0,
    0,
    v_ts
  )
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes            = organizer_event_earnings.total_votes
                           + CASE WHEN p_payment_context = 'vote' THEN 1 ELSE 0 END,
    paid_votes             = organizer_event_earnings.paid_votes
                           + CASE WHEN p_payment_context = 'vote' THEN 1 ELSE 0 END,
    paid_ticket_count      = organizer_event_earnings.paid_ticket_count
                           + CASE WHEN p_payment_context = 'ticket' THEN 1 ELSE 0 END,
    vote_revenue           = organizer_event_earnings.vote_revenue
                           + CASE WHEN p_payment_context = 'vote'   THEN p_gross_amount ELSE 0 END,
    ticket_revenue         = organizer_event_earnings.ticket_revenue
                           + CASE WHEN p_payment_context = 'ticket' THEN p_gross_amount ELSE 0 END,
    total_revenue          = organizer_event_earnings.total_revenue + p_gross_amount,
    vote_platform_fee_deducted   = organizer_event_earnings.vote_platform_fee_deducted
                           + CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    ticket_platform_fee_deducted = organizer_event_earnings.ticket_platform_fee_deducted
                           + CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    platform_fee_deducted  = organizer_event_earnings.platform_fee_deducted + v_fee_amount,
    provider_fee_deducted  = organizer_event_earnings.provider_fee_deducted + v_provider_fee_amount,
    vote_net_earnings        = organizer_event_earnings.vote_net_earnings
                           + CASE WHEN p_payment_context = 'vote'   THEN v_organizer_amount ELSE 0 END,
    ticket_net_earnings      = organizer_event_earnings.ticket_net_earnings
                           + CASE WHEN p_payment_context = 'ticket' THEN v_organizer_amount ELSE 0 END,
    net_earnings           = organizer_event_earnings.net_earnings + v_organizer_amount,
    updated_at             = v_ts;

  -- Also credit the platform wallet with the full platform fee (not net of provider).
  INSERT INTO admin_platform_wallet (id, platform_voting_earnings, platform_ticket_earnings, total_platform_earnings, last_updated)
  VALUES (1, 0, 0, 0, v_ts)
  ON CONFLICT (id) DO NOTHING;

  UPDATE admin_platform_wallet
  SET
    platform_voting_earnings   = platform_voting_earnings
                                 + CASE WHEN p_payment_context = 'vote'   THEN v_fee_amount ELSE 0 END,
    platform_ticket_earnings   = platform_ticket_earnings
                                 + CASE WHEN p_payment_context = 'ticket' THEN v_fee_amount ELSE 0 END,
    total_platform_earnings      = total_platform_earnings + v_fee_amount,
    last_updated                 = v_ts
  WHERE id = 1;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'platform_fee_amount', v_fee_amount,
    'provider_fee_amount', v_provider_fee_amount,
    'organizer_net_amount', v_organizer_amount
  );
END;
$$;

-- 7. Update the trigger so it also stores the full platform fee and provider fee.
CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
  v_ticketing_commission_percent NUMERIC;
  v_default_platform_fee_percent NUMERIC;
  v_paystack_fee_percent NUMERIC;
  v_nalo_fee_percent NUMERIC;
  v_platform_fee_percent NUMERIC;
  v_provider_fee_percent NUMERIC;
  v_gross_amount NUMERIC;
  v_platform_fee_amount NUMERIC;
  v_provider_fee_amount NUMERIC;
  v_event_title TEXT;
  v_organizer_id UUID;
  v_payment_context TEXT;
  v_provider TEXT;
BEGIN
  IF NEW.status NOT IN ('processed', 'success', 'paid') THEN
    RETURN NEW;
  END IF;

  v_payment_context := COALESCE(NEW.payment_context, 'vote');

  IF v_payment_context = 'vote' AND NEW.vote_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_payment_context = 'ticket' AND NEW.ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_payment_context = 'vote' THEN
    SELECT vote_type, COALESCE(amount_paid, 0)
    INTO v_vote_type, v_vote_amount
    FROM votes
    WHERE id::text = NEW.vote_id;
  ELSE
    v_vote_type := 'paid';
    v_vote_amount := COALESCE(NEW.amount, 0);
  END IF;

  IF v_vote_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.title, e.organizer_id
  INTO v_event_title, v_organizer_id
  FROM events e
  WHERE e.id::TEXT = NEW.event_id;

  SELECT
    ticketing_commission_percent,
    platform_fee_percent,
    COALESCE(paystack_fee_percent, 1.95),
    COALESCE(nalo_fee_percent, 2.00)
  INTO
    v_ticketing_commission_percent,
    v_default_platform_fee_percent,
    v_paystack_fee_percent,
    v_nalo_fee_percent
  FROM platform_settings
  LIMIT 1;

  IF v_payment_context = 'vote' THEN
    IF v_organizer_id IS NULL THEN
      v_platform_fee_percent := COALESCE(v_default_platform_fee_percent, 10);
    ELSE
      SELECT get_effective_platform_fee_percent(v_organizer_id)
      INTO v_platform_fee_percent;
      IF v_platform_fee_percent IS NULL THEN
        v_platform_fee_percent := COALESCE(v_default_platform_fee_percent, 10);
      END IF;
    END IF;
  ELSE
    IF v_organizer_id IS NULL THEN
      v_platform_fee_percent := COALESCE(v_ticketing_commission_percent, v_default_platform_fee_percent, 10);
    ELSE
      SELECT get_effective_ticketing_fee_percent(v_organizer_id)
      INTO v_platform_fee_percent;
      IF v_platform_fee_percent IS NULL THEN
        v_platform_fee_percent := COALESCE(v_ticketing_commission_percent, v_default_platform_fee_percent, 10);
      END IF;
    END IF;
  END IF;

  v_provider := LOWER(COALESCE(NEW.provider, 'paystack'));
  v_provider_fee_percent := CASE
    WHEN v_provider = 'nalo' THEN v_nalo_fee_percent
    ELSE v_paystack_fee_percent
  END;

  v_gross_amount := COALESCE(NEW.amount, v_vote_amount, 0);

  v_platform_fee_amount := CASE
    WHEN v_gross_amount > 0 THEN (v_gross_amount * v_platform_fee_percent / 100)
    ELSE 0
  END;

  v_provider_fee_amount := CASE
    WHEN v_gross_amount > 0 THEN (v_gross_amount * v_provider_fee_percent / 100)
    ELSE 0
  END;

  INSERT INTO admin_revenue_transactions (
    payment_id,
    payment_reference,
    event_id,
    event_title,
    organizer_id,
    vote_id,
    vote_type,
    payment_context,
    payment_provider,
    gross_amount,
    platform_fee_percent,
    platform_fee_amount,
    provider_fee_amount,
    organizer_net_amount,
    processed_at
  )
  VALUES (
    NEW.id::text,
    COALESCE(NEW.reference_id, NEW.reference),
    NEW.event_id,
    v_event_title,
    v_organizer_id,
    NEW.vote_id,
    v_vote_type,
    v_payment_context,
    COALESCE(NEW.provider, 'unknown'),
    v_gross_amount,
    v_platform_fee_percent,
    v_platform_fee_amount,
    v_provider_fee_amount,
    (v_gross_amount - v_platform_fee_amount),
    COALESCE(NEW.processed_at, NEW.verified_at, NEW.updated_at, NEW.created_at, timezone('utc', now()))
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;
