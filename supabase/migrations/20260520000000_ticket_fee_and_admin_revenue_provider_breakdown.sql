-- Alter platform settings for ticket-specific commission and track payment provider per admin revenue transaction

ALTER TABLE IF EXISTS platform_settings
  ADD COLUMN IF NOT EXISTS ticketing_commission_percent NUMERIC(5, 2);

ALTER TABLE IF EXISTS admin_revenue_transactions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'unknown';

UPDATE admin_revenue_transactions art
SET payment_provider = COALESCE(p.provider, 'unknown')
FROM payments p
WHERE art.payment_provider = 'unknown'
  AND art.payment_id::text = p.id::text;

CREATE OR REPLACE FUNCTION get_admin_revenue_source_summary()
RETURNS TABLE(
  payment_provider TEXT,
  total_platform_revenue NUMERIC,
  total_gross_revenue NUMERIC,
  total_transactions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(payment_provider, 'unknown') AS payment_provider,
    COALESCE(SUM(platform_fee_amount), 0) AS total_platform_revenue,
    COALESCE(SUM(gross_amount), 0) AS total_gross_revenue,
    COUNT(*)::BIGINT AS total_transactions
  FROM admin_revenue_transactions
  GROUP BY COALESCE(payment_provider, 'unknown')
  ORDER BY COALESCE(SUM(platform_fee_amount), 0) DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
  v_ticket_price NUMERIC;
  v_ticket_admin_fee NUMERIC;
  v_ticketing_commission_percent NUMERIC;
  v_default_platform_fee_percent NUMERIC;
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

    SELECT price, admin_fee
    INTO v_ticket_price, v_ticket_admin_fee
    FROM tickets
    WHERE id::text = NEW.ticket_id;
  END IF;

  IF v_vote_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.title, e.organizer_id
  INTO v_event_title, v_organizer_id
  FROM events e
  WHERE e.id::TEXT = NEW.event_id;

  SELECT ticketing_commission_percent, platform_fee_percent
  INTO v_ticketing_commission_percent, v_default_platform_fee_percent
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
    v_platform_fee_percent := COALESCE(v_ticketing_commission_percent, v_default_platform_fee_percent, 10);
    IF v_ticket_price > 0 AND v_ticket_admin_fee IS NOT NULL THEN
      v_platform_fee_percent := (v_ticket_admin_fee * 100) / v_ticket_price;
    END IF;
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
    payment_provider,
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
    COALESCE(NEW.provider, 'unknown'),
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
