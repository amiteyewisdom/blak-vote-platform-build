-- =============================================================================
-- Migration: Production vote/ticket payment integrity fixes
--
-- Purpose:
--   1. Require manual vote reasons and persist them in the append-only audit log.
--   2. Separate payment context for votes vs tickets without adding new tables.
--   3. Ensure tickets are issued only after verified payment and have unique codes.
--   4. Keep organizer/admin revenue idempotent and quantity-aware.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Manual vote audit trail: require a reason and persist it immutably.
-- ---------------------------------------------------------------------------
ALTER TABLE vote_manual_audit_context
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE vote_audit_log
  ADD COLUMN IF NOT EXISTS manual_reason TEXT;

UPDATE vote_manual_audit_context
SET reason = COALESCE(NULLIF(trim(reason), ''), 'manual adjustment')
WHERE reason IS NULL OR trim(reason) = '';

ALTER TABLE vote_manual_audit_context
  ALTER COLUMN reason SET NOT NULL;

CREATE OR REPLACE FUNCTION write_vote_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  vote_row JSONB := to_jsonb(NEW);
  manual_context vote_manual_audit_context%ROWTYPE;
  vote_transaction_id TEXT := vote_row ->> 'transaction_id';
BEGIN
  IF vote_transaction_id IS NOT NULL THEN
    SELECT *
    INTO manual_context
    FROM vote_manual_audit_context
    WHERE transaction_id = vote_transaction_id
    LIMIT 1;
  END IF;

  INSERT INTO vote_audit_log (
    vote_id,
    event_id,
    candidate_id,
    voter_id,
    voter_phone,
    vote_type,
    is_manual,
    quantity,
    vote_source,
    payment_method,
    transaction_id,
    added_by_user_id,
    manual_entry_mode,
    manual_reason,
    occurred_at
  )
  VALUES (
    vote_row ->> 'id',
    vote_row ->> 'event_id',
    COALESCE(vote_row ->> 'candidate_id', vote_row ->> 'nominee_id'),
    vote_row ->> 'voter_id',
    vote_row ->> 'voter_phone',
    COALESCE(vote_row ->> 'vote_type', 'free'),
    COALESCE((vote_row ->> 'is_manual')::BOOLEAN, FALSE),
    COALESCE((vote_row ->> 'quantity')::INTEGER, 1),
    vote_row ->> 'vote_source',
    vote_row ->> 'payment_method',
    vote_transaction_id,
    manual_context.added_by_user_id,
    manual_context.manual_entry_mode,
    manual_context.reason,
    COALESCE((vote_row ->> 'created_at')::TIMESTAMPTZ, timezone('utc', now()))
  );

  IF manual_context.transaction_id IS NOT NULL THEN
    DELETE FROM vote_manual_audit_context
    WHERE transaction_id = manual_context.transaction_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Payment context separation for votes vs tickets.
-- ---------------------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_context TEXT NOT NULL DEFAULT 'vote',
  ADD COLUMN IF NOT EXISTS ticket_id TEXT;

UPDATE payments
SET payment_context = CASE
    WHEN metadata ? 'ticketId' OR metadata ? 'ticket_id' THEN 'ticket'
    ELSE 'vote'
  END
WHERE payment_context IS NULL OR payment_context NOT IN ('vote', 'ticket');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_context_valid'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_context_valid
      CHECK (payment_context IN ('vote', 'ticket'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ticket_id_unique
  ON payments (ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_payment_context
  ON payments (payment_context, status, created_at DESC);

-- Duplicate pending-payment prevention only applies to vote payments.
CREATE OR REPLACE FUNCTION trg_prevent_duplicate_payment_for_candidate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_payment BIGINT;
BEGIN
  IF NEW.payment_context = 'vote'
     AND NEW.status IN ('pending', 'success')
     AND NEW.voter_phone IS NOT NULL THEN
    SELECT id INTO existing_payment
    FROM payments
    WHERE payment_context = 'vote'
      AND event_id = NEW.event_id
      AND candidate_id = NEW.candidate_id
      AND voter_phone = NEW.voter_phone
      AND status IN ('pending', 'success')
      AND id != NEW.id
      AND created_at > now() - interval '24 hours'
    LIMIT 1;

    IF existing_payment IS NOT NULL THEN
      RAISE EXCEPTION 'Duplicate payment: voter already has pending or recent payment for this candidate';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mark_stale_payments_as_failed()
RETURNS TABLE(marked_count INT) AS $$
DECLARE
  count_updated INT;
BEGIN
  UPDATE payments
  SET status = 'failed', gateway_status = 'stale_timeout'
  WHERE status = 'pending'
    AND created_at < now() - interval '30 minutes'
    AND (
      (payment_context = 'vote' AND vote_id IS NULL) OR
      (payment_context = 'ticket' AND ticket_id IS NULL)
    );

  GET DIAGNOSTICS count_updated = ROW_COUNT;
  RETURN QUERY SELECT count_updated;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_ghost_payments(
  p_age_minutes INT DEFAULT 60
)
RETURNS TABLE(deleted_count INT, archived_count INT) AS $$
DECLARE
  v_deleted INT;
  v_archived INT;
BEGIN
  UPDATE payments
  SET status = 'abandoned', gateway_status = 'no_resource_created'
  WHERE status IN ('success', 'pending')
    AND (
      (payment_context = 'vote' AND vote_id IS NULL) OR
      (payment_context = 'ticket' AND ticket_id IS NULL)
    )
    AND updated_at < now() - (make_interval(mins => p_age_minutes))
    AND NOT (status = 'abandoned');

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  DELETE FROM payments
  WHERE status = 'failed'
    AND created_at < now() - interval '90 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted, v_archived;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Ticket issuance hardening.
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_code TEXT;

UPDATE tickets
SET ticket_code = upper(substr(md5(coalesce(id::text, '') || random()::text || clock_timestamp()::text), 1, 12))
WHERE ticket_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_code_unique
  ON tickets (ticket_code)
  WHERE ticket_code IS NOT NULL;

UPDATE tickets
SET status = CASE
    WHEN lower(COALESCE(status, '')) = 'used' OR lower(COALESCE(usage_status, '')) = 'used' THEN 'used'
    ELSE 'valid'
  END,
  usage_status = CASE
    WHEN lower(COALESCE(usage_status, '')) = 'used' OR lower(COALESCE(status, '')) = 'used' THEN 'used'
    ELSE 'unused'
  END,
  purchased_at = CASE
    WHEN payment_reference IS NOT NULL AND purchased_at IS NULL THEN COALESCE(updated_at, created_at, timezone('utc', now()))
    ELSE purchased_at
  END;

ALTER TABLE tickets
  ALTER COLUMN status SET DEFAULT 'valid';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_usage_status_valid'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_usage_status_valid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_status_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_status_valid
      CHECK (status IN ('valid', 'used'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_usage_status_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_usage_status_valid
      CHECK (usage_status IN ('unused', 'used'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_status_payment_reference
  ON tickets (status, payment_reference, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Revenue separation and idempotent organizer/admin accounting.
-- ---------------------------------------------------------------------------
ALTER TABLE organizer_wallets
  ADD COLUMN IF NOT EXISTS ticket_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vote_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_ticket_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vote_platform_fees_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_platform_fees_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_votes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE organizer_event_earnings
  ADD COLUMN IF NOT EXISTS manual_votes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_ticket_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vote_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vote_platform_fee_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_platform_fee_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE admin_revenue_transactions
  ADD COLUMN IF NOT EXISTS payment_context TEXT NOT NULL DEFAULT 'vote';

UPDATE admin_revenue_transactions art
SET payment_context = COALESCE(p.payment_context, 'vote')
FROM payments p
WHERE p.id::text = art.payment_id;

CREATE INDEX IF NOT EXISTS idx_admin_revenue_transactions_context
  ON admin_revenue_transactions (payment_context, processed_at DESC);

CREATE OR REPLACE FUNCTION recalculate_revenue_state()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE organizer_event_earnings
  SET
    total_votes = 0,
    paid_votes = 0,
    free_votes = 0,
    manual_votes = 0,
    paid_ticket_count = 0,
    vote_revenue = 0,
    ticket_revenue = 0,
    total_revenue = 0,
    vote_platform_fee_deducted = 0,
    ticket_platform_fee_deducted = 0,
    platform_fee_deducted = 0,
    net_earnings = 0,
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
    GROUP BY e.organizer_id, v.event_id::TEXT
  ),
  ticket_metrics AS (
    SELECT
      e.organizer_id,
      t.event_id::TEXT AS event_id,
      COUNT(*)::BIGINT AS paid_ticket_count,
      COALESCE(SUM(CASE WHEN p.status IN ('processed', 'success') THEN p.amount ELSE 0 END), 0) AS ticket_revenue
    FROM tickets t
    JOIN events e ON e.id::TEXT = t.event_id::TEXT
    LEFT JOIN payments p ON p.reference = t.payment_reference AND p.payment_context = 'ticket'
    WHERE t.payment_reference IS NOT NULL
    GROUP BY e.organizer_id, t.event_id::TEXT
  ),
  fee_metrics AS (
    SELECT
      organizer_id,
      event_id,
      COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN platform_fee_amount ELSE 0 END), 0) AS vote_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0) AS ticket_fee
    FROM admin_revenue_transactions
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

DROP FUNCTION IF EXISTS get_organizer_wallet_summary(UUID);

CREATE OR REPLACE FUNCTION get_organizer_wallet_summary(p_organizer_id UUID)
RETURNS TABLE(
  total_revenue NUMERIC,
  vote_revenue NUMERIC,
  ticket_revenue NUMERIC,
  total_paid_votes BIGINT,
  manual_votes BIGINT,
  paid_ticket_count BIGINT,
  platform_fees_deducted NUMERIC,
  vote_platform_fees_deducted NUMERIC,
  ticket_platform_fees_deducted NUMERIC,
  net_balance NUMERIC,
  available_balance NUMERIC,
  pending_withdrawals NUMERIC,
  last_updated TIMESTAMPTZ
) AS $$
DECLARE
  v_pending NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM organizer_withdrawals
  WHERE organizer_id = p_organizer_id
    AND status IN ('pending', 'approved');

  RETURN QUERY
  SELECT
    ow.total_revenue,
    ow.vote_revenue,
    ow.ticket_revenue,
    ow.total_paid_votes,
    ow.manual_votes,
    ow.paid_ticket_count,
    ow.platform_fees_deducted,
    ow.vote_platform_fees_deducted,
    ow.ticket_platform_fees_deducted,
    ow.net_balance,
    GREATEST(ow.net_balance - v_pending, 0) AS available_balance,
    v_pending AS pending_withdrawals,
    ow.last_updated
  FROM organizer_wallets ow
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_organizer_event_earnings(UUID);

CREATE OR REPLACE FUNCTION get_organizer_event_earnings(p_organizer_id UUID)
RETURNS TABLE(
  event_id TEXT,
  total_votes BIGINT,
  paid_votes BIGINT,
  free_votes BIGINT,
  manual_votes BIGINT,
  paid_ticket_count BIGINT,
  vote_revenue NUMERIC,
  ticket_revenue NUMERIC,
  total_revenue NUMERIC,
  platform_fee_percent NUMERIC,
  vote_platform_fee_deducted NUMERIC,
  ticket_platform_fee_deducted NUMERIC,
  platform_fee_deducted NUMERIC,
  net_earnings NUMERIC,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oee.event_id,
    oee.total_votes,
    oee.paid_votes,
    oee.free_votes,
    oee.manual_votes,
    oee.paid_ticket_count,
    oee.vote_revenue,
    oee.ticket_revenue,
    oee.total_revenue,
    oee.platform_fee_percent,
    oee.vote_platform_fee_deducted,
    oee.ticket_platform_fee_deducted,
    oee.platform_fee_deducted,
    oee.net_earnings,
    oee.updated_at
  FROM organizer_event_earnings oee
  WHERE oee.organizer_id = p_organizer_id
  ORDER BY oee.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_admin_revenue_summary();

CREATE OR REPLACE FUNCTION get_admin_revenue_summary()
RETURNS TABLE(
  total_platform_revenue NUMERIC,
  total_gross_revenue NUMERIC,
  vote_platform_revenue NUMERIC,
  ticket_platform_revenue NUMERIC,
  vote_gross_revenue NUMERIC,
  ticket_gross_revenue NUMERIC,
  total_transactions BIGINT,
  vote_transactions BIGINT,
  ticket_transactions BIGINT,
  last_transaction_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(platform_fee_amount), 0) AS total_platform_revenue,
    COALESCE(SUM(gross_amount), 0) AS total_gross_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN platform_fee_amount ELSE 0 END), 0) AS vote_platform_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0) AS ticket_platform_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN gross_amount ELSE 0 END), 0) AS vote_gross_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN gross_amount ELSE 0 END), 0) AS ticket_gross_revenue,
    COUNT(*)::BIGINT AS total_transactions,
    COUNT(*) FILTER (WHERE payment_context = 'vote')::BIGINT AS vote_transactions,
    COUNT(*) FILTER (WHERE payment_context = 'ticket')::BIGINT AS ticket_transactions,
    MAX(processed_at) AS last_transaction_at
  FROM admin_revenue_transactions;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_admin_revenue_by_event();

CREATE OR REPLACE FUNCTION get_admin_revenue_by_event()
RETURNS TABLE(
  event_id TEXT,
  event_title TEXT,
  total_platform_revenue NUMERIC,
  total_gross_revenue NUMERIC,
  vote_platform_revenue NUMERIC,
  ticket_platform_revenue NUMERIC,
  vote_gross_revenue NUMERIC,
  ticket_gross_revenue NUMERIC,
  total_transactions BIGINT,
  vote_transactions BIGINT,
  ticket_transactions BIGINT,
  last_transaction_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    art.event_id,
    COALESCE(MAX(art.event_title), 'Untitled Event') AS event_title,
    COALESCE(SUM(art.platform_fee_amount), 0) AS total_platform_revenue,
    COALESCE(SUM(art.gross_amount), 0) AS total_gross_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'vote' THEN art.platform_fee_amount ELSE 0 END), 0) AS vote_platform_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.platform_fee_amount ELSE 0 END), 0) AS ticket_platform_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'vote' THEN art.gross_amount ELSE 0 END), 0) AS vote_gross_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.gross_amount ELSE 0 END), 0) AS ticket_gross_revenue,
    COUNT(*)::BIGINT AS total_transactions,
    COUNT(*) FILTER (WHERE art.payment_context = 'vote')::BIGINT AS vote_transactions,
    COUNT(*) FILTER (WHERE art.payment_context = 'ticket')::BIGINT AS ticket_transactions,
    MAX(art.processed_at) AS last_transaction_at
  FROM admin_revenue_transactions art
  GROUP BY art.event_id
  ORDER BY total_platform_revenue DESC, total_transactions DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_link_payment_to_organizer_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('processed', 'success') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IN ('processed', 'success')
     AND COALESCE(OLD.vote_id, '') = COALESCE(NEW.vote_id, '')
     AND COALESCE(OLD.ticket_id, '') = COALESCE(NEW.ticket_id, '') THEN
    RETURN NEW;
  END IF;

  PERFORM recalculate_revenue_state();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_payment_to_organizer_wallet ON payments;
CREATE TRIGGER trg_link_payment_to_organizer_wallet
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_link_payment_to_organizer_wallet();

CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
  v_platform_fee_percent NUMERIC;
  v_gross_amount NUMERIC;
  v_platform_fee_amount NUMERIC;
  v_event_title TEXT;
  v_organizer_id UUID;
  v_payment_context TEXT;
BEGIN
  IF NEW.status NOT IN ('processed', 'success') THEN
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

  IF v_organizer_id IS NULL THEN
    SELECT COALESCE(platform_fee_percent, 10)
    INTO v_platform_fee_percent
    FROM platform_settings
    LIMIT 1;
  ELSE
    SELECT get_effective_platform_fee_percent(v_organizer_id)
    INTO v_platform_fee_percent;
  END IF;

  v_gross_amount := COALESCE(NEW.amount, v_vote_amount, 0);

  v_platform_fee_amount := CASE
    WHEN v_gross_amount > 0 THEN (v_gross_amount * v_platform_fee_percent / 100)
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
    gross_amount,
    platform_fee_percent,
    platform_fee_amount,
    organizer_net_amount,
    processed_at
  )
  VALUES (
    NEW.id::text,
    NEW.reference,
    NEW.event_id,
    v_event_title,
    v_organizer_id,
    NEW.vote_id,
    v_vote_type,
    v_payment_context,
    v_gross_amount,
    v_platform_fee_percent,
    v_platform_fee_amount,
    (v_gross_amount - v_platform_fee_amount),
    COALESCE(NEW.processed_at, NEW.verified_at, NEW.updated_at, NEW.created_at, timezone('utc', now()))
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_admin_revenue_transaction ON payments;
CREATE TRIGGER trg_capture_admin_revenue_transaction
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_capture_admin_revenue_transaction();

SELECT recalculate_revenue_state();