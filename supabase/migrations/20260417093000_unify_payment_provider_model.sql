ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS organizer_id TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS reference_id TEXT;

UPDATE payments
SET reference_id = COALESCE(reference_id, reference)
WHERE reference_id IS NULL;

UPDATE payments p
SET organizer_id = e.organizer_id::text
FROM events e
WHERE p.organizer_id IS NULL
  AND p.event_id IS NOT NULL
  AND e.id::text = p.event_id::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_id_unique
  ON payments (reference_id)
  WHERE reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_payments_reference_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_id IS NULL AND NEW.reference IS NOT NULL THEN
    NEW.reference_id := NEW.reference;
  ELSIF NEW.reference IS NULL AND NEW.reference_id IS NOT NULL THEN
    NEW.reference := NEW.reference_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payments_reference_columns ON payments;
CREATE TRIGGER trg_sync_payments_reference_columns
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_payments_reference_columns();

CREATE OR REPLACE FUNCTION trg_prevent_duplicate_payment_for_candidate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_payment BIGINT;
BEGIN
  IF NEW.payment_context = 'vote'
     AND NEW.status IN ('pending', 'paid', 'success')
     AND NEW.voter_phone IS NOT NULL THEN
    SELECT id INTO existing_payment
    FROM payments
    WHERE payment_context = 'vote'
      AND event_id = NEW.event_id
      AND candidate_id = NEW.candidate_id
      AND voter_phone = NEW.voter_phone
      AND status IN ('pending', 'paid', 'success')
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

CREATE OR REPLACE FUNCTION check_fraud_pattern_daily_limit(
  p_voter_phone TEXT,
  p_max_daily_attempts INT DEFAULT 10
)
RETURNS TABLE(attempts_today INT, limit_exceeded BOOLEAN) AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM payments
  WHERE voter_phone = p_voter_phone
    AND created_at > now() - interval '24 hours'
    AND status IN ('pending', 'failed', 'paid', 'success');

  RETURN QUERY SELECT v_count, v_count >= p_max_daily_attempts;
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
  WHERE status IN ('paid', 'success', 'pending')
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
      COALESCE(SUM(CASE WHEN p.status IN ('processed', 'success', 'paid') THEN p.amount ELSE 0 END), 0) AS ticket_revenue
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

CREATE OR REPLACE FUNCTION trg_link_payment_to_organizer_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('processed', 'success', 'paid') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IN ('processed', 'success', 'paid')
     AND COALESCE(OLD.vote_id, '') = COALESCE(NEW.vote_id, '')
     AND COALESCE(OLD.ticket_id, '') = COALESCE(NEW.ticket_id, '') THEN
    RETURN NEW;
  END IF;

  PERFORM recalculate_revenue_state();
  RETURN NEW;
END;
$$;

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
    COALESCE(NEW.reference_id, NEW.reference),
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