-- ============================================================================
-- Migration: Separate Ticketing + Per-Event Withdrawals + 5-Char Ticket Codes
-- ============================================================================

-- 1. Add event_type to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'voting',
  ADD COLUMN IF NOT EXISTS vote_platform_fee_percent NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS ticketing_fee_percent NUMERIC(5, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_event_type_valid'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_event_type_valid
      CHECK (event_type IN ('voting', 'ticketing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type, status, created_at DESC);

-- 2. Add organizer transferable balance (for deleted event unwithdrawn revenue)
ALTER TABLE organizer_wallets
  ADD COLUMN IF NOT EXISTS transferable_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 3. Add per-event withdrawn amounts
ALTER TABLE organizer_event_earnings
  ADD COLUMN IF NOT EXISTS withdrawn_vote_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawn_ticket_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vote_net_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_net_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 4. Add per-event + per-type withdrawal tracking
ALTER TABLE organizer_withdrawals
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT NOT NULL DEFAULT 'combined';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizer_withdrawals_type_valid'
  ) THEN
    ALTER TABLE organizer_withdrawals ADD CONSTRAINT organizer_withdrawals_type_valid
      CHECK (withdrawal_type IN ('vote', 'ticket', 'combined'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_event_id
  ON organizer_withdrawals (organizer_id, event_id, created_at DESC);

-- 5-pre. Drop functions whose RETURNS TABLE signature is changing (cannot use CREATE OR REPLACE for signature changes)
DROP FUNCTION IF EXISTS get_organizer_wallet_summary(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_organizer_event_earnings(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_event_effective_fee_percent(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_event_earnings_on_vote(UUID, TEXT, NUMERIC, TEXT) CASCADE;
DROP FUNCTION IF EXISTS generate_ticket_code() CASCADE;
DROP FUNCTION IF EXISTS issue_ticket_purchase(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS issue_ticket_purchase(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS transfer_event_balance_on_delete(TEXT, UUID) CASCADE;

-- 5. Helper: Get effective fee percent for a specific event
CREATE OR REPLACE FUNCTION get_event_effective_fee_percent(
  p_event_id TEXT,
  p_fee_type TEXT -- 'vote' or 'ticketing'
)
RETURNS NUMERIC AS $$
DECLARE
  v_event_fee NUMERIC;
  v_organizer_id UUID;
  v_global_fee NUMERIC;
BEGIN
  SELECT organizer_id, vote_platform_fee_percent, ticketing_fee_percent
  INTO v_organizer_id, v_event_fee, v_event_fee
  FROM events WHERE id = p_event_id;

  IF p_fee_type = 'vote' THEN
    SELECT vote_platform_fee_percent INTO v_event_fee FROM events WHERE id = p_event_id;
  ELSE
    SELECT ticketing_fee_percent INTO v_event_fee FROM events WHERE id = p_event_id;
  END IF;

  IF v_event_fee IS NOT NULL THEN
    RETURN v_event_fee;
  END IF;

  IF v_organizer_id IS NOT NULL THEN
    IF p_fee_type = 'vote' THEN
      RETURN get_effective_platform_fee_percent(v_organizer_id);
    ELSE
      RETURN get_effective_ticketing_fee_percent(v_organizer_id);
    END IF;
  END IF;

  SELECT COALESCE(platform_fee_percent, 10) INTO v_global_fee FROM platform_settings LIMIT 1;
  RETURN COALESCE(v_global_fee, 10);
END;
$$ LANGUAGE plpgsql;

-- 6. Update event earnings function to use per-event fees and track net per type
CREATE OR REPLACE FUNCTION update_event_earnings_on_vote(
  p_organizer_id UUID,
  p_event_id TEXT,
  p_amount_paid NUMERIC,
  p_vote_type TEXT DEFAULT 'free'
)
RETURNS VOID AS $$
DECLARE
  v_platform_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  SELECT get_event_effective_fee_percent(p_event_id, 'vote') INTO v_platform_fee_percent;

  v_fee_amount := CASE
    WHEN p_vote_type = 'paid' AND p_amount_paid > 0 THEN (p_amount_paid * v_platform_fee_percent / 100)
    ELSE 0
  END;

  v_net_amount := p_amount_paid - v_fee_amount;

  INSERT INTO organizer_event_earnings (
    organizer_id, event_id, total_votes, paid_votes, free_votes,
    total_revenue, vote_revenue, platform_fee_percent,
    platform_fee_deducted, vote_platform_fee_deducted,
    net_earnings, vote_net_earnings, updated_at
  )
  VALUES (
    p_organizer_id, p_event_id, 1,
    CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    p_amount_paid, p_amount_paid, v_platform_fee_percent,
    v_fee_amount, v_fee_amount,
    v_net_amount, v_net_amount, timezone('utc', now())
  )
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes = organizer_event_earnings.total_votes + 1,
    paid_votes = organizer_event_earnings.paid_votes + CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    free_votes = organizer_event_earnings.free_votes + CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    total_revenue = organizer_event_earnings.total_revenue + p_amount_paid,
    vote_revenue = organizer_event_earnings.vote_revenue + CASE WHEN p_vote_type = 'paid' THEN p_amount_paid ELSE 0 END,
    platform_fee_deducted = organizer_event_earnings.platform_fee_deducted + v_fee_amount,
    vote_platform_fee_deducted = organizer_event_earnings.vote_platform_fee_deducted + v_fee_amount,
    net_earnings = organizer_event_earnings.net_earnings + v_net_amount,
    vote_net_earnings = organizer_event_earnings.vote_net_earnings + v_net_amount,
    updated_at = timezone('utc', now());
END;
$$ LANGUAGE plpgsql;

-- 7. Update recalculate function to include per-event fees and withdrawn amounts
CREATE OR REPLACE FUNCTION recalculate_revenue_state()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE organizer_event_earnings
  SET
    total_votes = 0, paid_votes = 0, free_votes = 0, manual_votes = 0,
    paid_ticket_count = 0, vote_revenue = 0, ticket_revenue = 0,
    total_revenue = 0, vote_platform_fee_deducted = 0, ticket_platform_fee_deducted = 0,
    platform_fee_deducted = 0, net_earnings = 0, vote_net_earnings = 0, ticket_net_earnings = 0,
    withdrawn_vote_revenue = COALESCE(withdrawn_vote_revenue, 0),
    withdrawn_ticket_revenue = COALESCE(withdrawn_ticket_revenue, 0),
    updated_at = timezone('utc', now());

  WITH vote_metrics AS (
    SELECT
      e.organizer_id,
      v.event_id::TEXT AS event_id,
      COALESCE(SUM(v.quantity), 0)::BIGINT AS total_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.quantity ELSE 0 END), 0)::BIGINT AS paid_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'free' THEN v.quantity ELSE 0 END), 0)::BIGINT AS free_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'manual' THEN v.quantity ELSE 0 END), 0)::BIGINT AS manual_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.amount_paid ELSE 0 END), 0) AS vote_revenue
    FROM votes v
    JOIN events e ON e.id::TEXT = v.event_id::TEXT
    WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY e.organizer_id, v.event_id::TEXT
  ),
  ticket_metrics AS (
    SELECT
      e.organizer_id,
      t.event_id::TEXT AS event_id,
      COUNT(*)::BIGINT AS paid_ticket_count,
      COALESCE(SUM(CASE WHEN p.status IN ('processed', 'success', 'paid') THEN p.amount ELSE 0 END), 0) AS ticket_revenue
    FROM tickets t
    JOIN events e ON e.id::TEXT = t.event_id::TEXT
    LEFT JOIN payments p ON p.reference = t.payment_reference AND p.payment_context = 'ticket'
    WHERE t.payment_reference IS NOT NULL AND e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY e.organizer_id, t.event_id::TEXT
  ),
  fee_metrics AS (
    SELECT
      organizer_id, event_id,
      COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN platform_fee_amount ELSE 0 END), 0) AS vote_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0) AS ticket_fee
    FROM admin_revenue_transactions
    WHERE payment_context IN ('vote', 'ticket')
    GROUP BY organizer_id, event_id
  )
  UPDATE organizer_event_earnings oee
  SET
    total_votes = COALESCE(vm.total_votes, 0),
    paid_votes = COALESCE(vm.paid_votes, 0),
    free_votes = COALESCE(vm.free_votes, 0),
    manual_votes = COALESCE(vm.manual_votes, 0),
    paid_ticket_count = COALESCE(tm.paid_ticket_count, 0),
    vote_revenue = COALESCE(vm.vote_revenue, 0),
    ticket_revenue = COALESCE(tm.ticket_revenue, 0),
    total_revenue = COALESCE(vm.vote_revenue, 0) + COALESCE(tm.ticket_revenue, 0),
    vote_platform_fee_deducted = COALESCE(fm.vote_fee, 0),
    ticket_platform_fee_deducted = COALESCE(fm.ticket_fee, 0),
    platform_fee_deducted = COALESCE(fm.vote_fee, 0) + COALESCE(fm.ticket_fee, 0),
    vote_net_earnings = COALESCE(vm.vote_revenue, 0) - COALESCE(fm.vote_fee, 0),
    ticket_net_earnings = COALESCE(tm.ticket_revenue, 0) - COALESCE(fm.ticket_fee, 0),
    net_earnings = (COALESCE(vm.vote_revenue, 0) + COALESCE(tm.ticket_revenue, 0)) - (COALESCE(fm.vote_fee, 0) + COALESCE(fm.ticket_fee, 0)),
    updated_at = timezone('utc', now())
  FROM vote_metrics vm
  FULL OUTER JOIN ticket_metrics tm
    ON tm.organizer_id = vm.organizer_id AND tm.event_id = vm.event_id
  FULL OUTER JOIN fee_metrics fm
    ON fm.organizer_id = COALESCE(vm.organizer_id, tm.organizer_id)
   AND fm.event_id = COALESCE(vm.event_id, tm.event_id)
  WHERE oee.organizer_id = COALESCE(vm.organizer_id, tm.organizer_id)
    AND oee.event_id = COALESCE(vm.event_id, tm.event_id);

  -- Update withdrawn amounts from organizer_withdrawals
  WITH per_event_withdrawals AS (
    SELECT
      event_id,
      COALESCE(SUM(CASE WHEN withdrawal_type IN ('vote', 'combined') THEN amount_requested ELSE 0 END), 0) AS vote_wd,
      COALESCE(SUM(CASE WHEN withdrawal_type IN ('ticket', 'combined') THEN amount_requested ELSE 0 END), 0) AS ticket_wd
    FROM organizer_withdrawals
    WHERE status IN ('pending', 'approved', 'processed')
      AND event_id IS NOT NULL
    GROUP BY event_id
  )
  UPDATE organizer_event_earnings oee
  SET
    withdrawn_vote_revenue = COALESCE(pw.vote_wd, 0),
    withdrawn_ticket_revenue = COALESCE(pw.ticket_wd, 0)
  FROM per_event_withdrawals pw
  WHERE oee.event_id = pw.event_id;

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
    net_balance = (COALESCE(subq.vote_revenue, 0) + COALESCE(subq.ticket_revenue, 0)) - (COALESCE(subq.vote_fee, 0) + COALESCE(subq.ticket_fee, 0)),
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

-- 8. Update wallet summary function
CREATE OR REPLACE FUNCTION get_organizer_wallet_summary(p_organizer_id UUID)
RETURNS TABLE(
  total_revenue NUMERIC, vote_revenue NUMERIC, ticket_revenue NUMERIC,
  total_paid_votes BIGINT, manual_votes BIGINT, paid_ticket_count BIGINT,
  platform_fees_deducted NUMERIC, vote_platform_fees_deducted NUMERIC, ticket_platform_fees_deducted NUMERIC,
  net_balance NUMERIC, available_balance NUMERIC, pending_withdrawals NUMERIC,
  transferable_balance NUMERIC, last_updated TIMESTAMPTZ
) AS $$
DECLARE
  v_pending NUMERIC;
  v_transferable NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM organizer_withdrawals
  WHERE organizer_id = p_organizer_id
    AND status IN ('pending', 'approved');

  SELECT COALESCE(transferable_balance, 0) INTO v_transferable
  FROM organizer_wallets WHERE organizer_id = p_organizer_id;

  RETURN QUERY
  SELECT
    ow.total_revenue, ow.vote_revenue, ow.ticket_revenue,
    ow.total_paid_votes, ow.manual_votes, ow.paid_ticket_count,
    ow.platform_fees_deducted, ow.vote_platform_fees_deducted, ow.ticket_platform_fees_deducted,
    ow.net_balance,
    GREATEST(ow.net_balance - v_pending + v_transferable, 0) AS available_balance,
    v_pending AS pending_withdrawals,
    v_transferable AS transferable_balance,
    ow.last_updated
  FROM organizer_wallets ow
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Update get_organizer_event_earnings to include per-type net and withdrawn
CREATE OR REPLACE FUNCTION get_organizer_event_earnings(p_organizer_id UUID)
RETURNS TABLE(
  event_id TEXT, total_votes BIGINT, paid_votes BIGINT, free_votes BIGINT,
  manual_votes BIGINT, paid_ticket_count BIGINT,
  vote_revenue NUMERIC, ticket_revenue NUMERIC, total_revenue NUMERIC,
  platform_fee_percent NUMERIC, vote_platform_fee_deducted NUMERIC, ticket_platform_fee_deducted NUMERIC,
  platform_fee_deducted NUMERIC, net_earnings NUMERIC,
  vote_net_earnings NUMERIC, ticket_net_earnings NUMERIC,
  withdrawn_vote_revenue NUMERIC, withdrawn_ticket_revenue NUMERIC,
  revenue_left NUMERIC, updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oee.event_id, oee.total_votes, oee.paid_votes, oee.free_votes,
    oee.manual_votes, oee.paid_ticket_count,
    oee.vote_revenue, oee.ticket_revenue, oee.total_revenue,
    oee.platform_fee_percent, oee.vote_platform_fee_deducted, oee.ticket_platform_fee_deducted,
    oee.platform_fee_deducted, oee.net_earnings,
    oee.vote_net_earnings, oee.ticket_net_earnings,
    oee.withdrawn_vote_revenue, oee.withdrawn_ticket_revenue,
    GREATEST(oee.net_earnings - oee.withdrawn_vote_revenue - oee.withdrawn_ticket_revenue, 0) AS revenue_left,
    oee.updated_at
  FROM organizer_event_earnings oee
  WHERE oee.organizer_id = p_organizer_id
  ORDER BY oee.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 10. Change ticket code generation to 5 characters (full alphanumeric A-Z, 0-9)
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
BEGIN
  LOOP
    SELECT string_agg(substr(v_chars, floor(random() * 36)::int + 1, 1), '')
    INTO v_code
    FROM generate_series(1, 5);
    SELECT EXISTS(SELECT 1 FROM tickets WHERE ticket_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION issue_ticket_purchase(
  p_plan_id UUID,
  p_payment_reference TEXT,
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT,
  p_quantity INTEGER DEFAULT 1
)
RETURNS TABLE(ticket_id UUID, ticket_code TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan tickets%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_available INTEGER;
BEGIN
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'Ticket plan is required';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Ticket quantity must be at least 1';
  END IF;

  SELECT * INTO v_plan FROM tickets WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket plan not found';
  END IF;
  IF COALESCE(v_plan.ticket_kind, 'issued') <> 'plan' THEN
    RAISE EXCEPTION 'Only ticket plans can be issued';
  END IF;

  v_available := GREATEST(COALESCE(v_plan.quantity, 0) - COALESCE(v_plan.sold_count, 0), 0);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Only % tickets remaining for this plan', v_available;
  END IF;

  UPDATE tickets SET sold_count = COALESCE(sold_count, 0) + p_quantity, updated_at = v_now WHERE id = v_plan.id;

  RETURN QUERY
  INSERT INTO tickets (
    event_id, parent_ticket_id, ticket_kind, name, price, quantity, admin_fee,
    ticket_code, status, usage_status, payment_reference, buyer_name, buyer_email, buyer_phone,
    purchased_at, created_at, updated_at
  )
  SELECT
    v_plan.event_id, v_plan.id, 'issued', v_plan.name, v_plan.price, 1, v_plan.admin_fee,
    generate_ticket_code(), 'valid', 'unused', p_payment_reference, p_buyer_name, p_buyer_email, p_buyer_phone,
    v_now, v_now, v_now
  FROM generate_series(1, p_quantity) AS series_number
  RETURNING id, ticket_code;
END;
$$;

-- Backfill existing unissued ticket codes to 5 chars where possible (skip if they have payment_reference)
UPDATE tickets
SET ticket_code = generate_ticket_code()
WHERE ticket_kind = 'issued'
  AND payment_reference IS NOT NULL
  AND (ticket_code IS NULL OR LENGTH(ticket_code) > 5);

-- 11. Function to transfer unwithdrawn event balance to organizer on deletion
CREATE OR REPLACE FUNCTION transfer_event_balance_on_delete(p_event_id TEXT, p_organizer_id UUID)
RETURNS TABLE(transferred_vote NUMERIC, transferred_ticket NUMERIC, total_transferred NUMERIC) AS $$
DECLARE
  v_ee organizer_event_earnings%ROWTYPE;
  v_vote_left NUMERIC;
  v_ticket_left NUMERIC;
BEGIN
  SELECT * INTO v_ee
  FROM organizer_event_earnings
  WHERE event_id = p_event_id AND organizer_id = p_organizer_id;

  IF v_ee.event_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  v_vote_left := GREATEST(v_ee.vote_net_earnings - v_ee.withdrawn_vote_revenue, 0);
  v_ticket_left := GREATEST(v_ee.ticket_net_earnings - v_ee.withdrawn_ticket_revenue, 0);

  IF (v_vote_left + v_ticket_left) > 0 THEN
    UPDATE organizer_wallets
    SET
      transferable_balance = COALESCE(transferable_balance, 0) + v_vote_left + v_ticket_left,
      last_updated = timezone('utc', now())
    WHERE organizer_id = p_organizer_id;

    IF NOT FOUND THEN
      INSERT INTO organizer_wallets (organizer_id, transferable_balance)
      VALUES (p_organizer_id, v_vote_left + v_ticket_left)
      ON CONFLICT (organizer_id) DO UPDATE SET
        transferable_balance = COALESCE(organizer_wallets.transferable_balance, 0) + v_vote_left + v_ticket_left,
        last_updated = timezone('utc', now());
    END IF;
  END IF;

  RETURN QUERY SELECT v_vote_left, v_ticket_left, (v_vote_left + v_ticket_left);
END;
$$ LANGUAGE plpgsql;

-- 12. Run recalculation to populate new columns
SELECT recalculate_revenue_state();
