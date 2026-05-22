-- Per-organizer ticketing commission (separate from vote platform fee)

ALTER TABLE organizer_fee_overrides
  ALTER COLUMN platform_fee_percent DROP NOT NULL;

ALTER TABLE organizer_fee_overrides
  ADD COLUMN IF NOT EXISTS ticketing_fee_percent NUMERIC(5, 2)
    CHECK (ticketing_fee_percent IS NULL OR (ticketing_fee_percent >= 0 AND ticketing_fee_percent <= 100));

CREATE OR REPLACE FUNCTION get_effective_platform_fee_percent(p_organizer_ref UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_override NUMERIC;
  v_default NUMERIC;
BEGIN
  IF p_organizer_ref IS NULL THEN
    SELECT COALESCE(platform_fee_percent, 10)
    INTO v_default
    FROM platform_settings
    LIMIT 1;

    RETURN COALESCE(v_default, 10);
  END IF;

  v_user_id := p_organizer_ref;

  SELECT o.user_id
  INTO v_user_id
  FROM organizers o
  WHERE o.id = p_organizer_ref
  LIMIT 1;

  v_user_id := COALESCE(v_user_id, p_organizer_ref);

  SELECT ofo.platform_fee_percent
  INTO v_override
  FROM organizer_fee_overrides ofo
  WHERE ofo.organizer_user_id = v_user_id
    AND ofo.platform_fee_percent IS NOT NULL
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT COALESCE(platform_fee_percent, 10)
  INTO v_default
  FROM platform_settings
  LIMIT 1;

  RETURN COALESCE(v_default, 10);
END;
$$;

CREATE OR REPLACE FUNCTION get_effective_ticketing_fee_percent(p_organizer_ref UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_override NUMERIC;
  v_ticketing_default NUMERIC;
  v_vote_default NUMERIC;
BEGIN
  IF p_organizer_ref IS NULL THEN
    SELECT ticketing_commission_percent, platform_fee_percent
    INTO v_ticketing_default, v_vote_default
    FROM platform_settings
    LIMIT 1;

    RETURN COALESCE(v_ticketing_default, v_vote_default, 10);
  END IF;

  v_user_id := p_organizer_ref;

  SELECT o.user_id
  INTO v_user_id
  FROM organizers o
  WHERE o.id = p_organizer_ref
  LIMIT 1;

  v_user_id := COALESCE(v_user_id, p_organizer_ref);

  SELECT ofo.ticketing_fee_percent
  INTO v_override
  FROM organizer_fee_overrides ofo
  WHERE ofo.organizer_user_id = v_user_id
    AND ofo.ticketing_fee_percent IS NOT NULL
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT ticketing_commission_percent, platform_fee_percent
  INTO v_ticketing_default, v_vote_default
  FROM platform_settings
  LIMIT 1;

  RETURN COALESCE(v_ticketing_default, v_vote_default, 10);
END;
$$;

CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
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
