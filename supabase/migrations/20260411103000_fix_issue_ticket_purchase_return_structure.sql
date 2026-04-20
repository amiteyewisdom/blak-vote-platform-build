DROP FUNCTION IF EXISTS issue_ticket_purchase(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER);

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

  SELECT *
  INTO v_plan
  FROM tickets
  WHERE id = p_plan_id
  FOR UPDATE;

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

  UPDATE tickets
  SET
    sold_count = COALESCE(sold_count, 0) + p_quantity,
    updated_at = v_now
  WHERE id = v_plan.id;

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO tickets (
      event_id,
      parent_ticket_id,
      ticket_kind,
      ticket_type,
      name,
      price,
      quantity,
      admin_fee,
      ticket_code,
      status,
      usage_status,
      payment_reference,
      buyer_name,
      buyer_email,
      buyer_phone,
      purchased_at,
      created_at,
      updated_at
    )
    SELECT
      v_plan.event_id,
      v_plan.id,
      'issued',
      COALESCE(v_plan.ticket_type, CASE WHEN COALESCE(v_plan.price, 0) > 0 THEN 'paid' ELSE 'free' END),
      v_plan.name,
      v_plan.price,
      1,
      COALESCE(v_plan.admin_fee, 0),
      upper(substr(md5(random()::text || clock_timestamp()::text || series_number::text || coalesce(p_payment_reference, 'FREE')), 1, 12)),
      'valid',
      'unused',
      p_payment_reference,
      p_buyer_name,
      p_buyer_email,
      p_buyer_phone,
      v_now,
      v_now,
      v_now
    FROM generate_series(1, p_quantity) AS series_number
    RETURNING id, ticket_code
  )
  SELECT inserted.id, inserted.ticket_code
  FROM inserted;
END;
$$;
