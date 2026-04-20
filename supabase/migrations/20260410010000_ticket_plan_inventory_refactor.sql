-- =============================================================================
-- Migration: Ticket plan inventory refactor
--
-- Purpose:
--   1. Separate sellable ticket plans from issued attendee tickets.
--   2. Preserve legacy ticket rows by consolidating unsold duplicates into plans.
--   3. Add atomic issuance for free and paid multi-ticket purchases.
-- =============================================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_kind TEXT NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS parent_ticket_id UUID,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_ticket_kind_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_ticket_kind_valid
      CHECK (ticket_kind IN ('plan', 'issued'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_parent_ticket_id_fkey'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_parent_ticket_id_fkey
      FOREIGN KEY (parent_ticket_id)
      REFERENCES tickets(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_kind_event
  ON tickets (ticket_kind, event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_parent_ticket_id
  ON tickets (parent_ticket_id, created_at DESC);

UPDATE tickets
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

WITH legacy_groups AS (
  SELECT
    MIN(id::text)::uuid AS keep_id,
    ARRAY_AGG(id ORDER BY created_at ASC, id::text ASC) AS grouped_ids,
    COUNT(*)::INTEGER AS grouped_quantity
  FROM tickets
  WHERE payment_reference IS NULL
    AND parent_ticket_id IS NULL
  GROUP BY event_id, COALESCE(name, ''), COALESCE(price, 0), COALESCE(admin_fee, 0)
  HAVING COUNT(*) > 1
),
updated_plans AS (
  UPDATE tickets t
  SET
    ticket_kind = 'plan',
    quantity = legacy_groups.grouped_quantity,
    sold_count = 0,
    ticket_code = NULL,
    usage_status = 'unused',
    status = 'valid',
    updated_at = timezone('utc', now())
  FROM legacy_groups
  WHERE t.id = legacy_groups.keep_id
  RETURNING legacy_groups.grouped_ids, legacy_groups.keep_id
)
DELETE FROM tickets t
USING updated_plans up
WHERE t.id IN (
  SELECT grouped_id
  FROM unnest(up.grouped_ids) WITH ORDINALITY AS grouped(grouped_id, grouped_index)
  WHERE grouped.grouped_index > 1
)
  AND t.id <> up.keep_id;

UPDATE tickets
SET
  ticket_kind = CASE
    WHEN payment_reference IS NULL THEN 'plan'
    ELSE 'issued'
  END,
  sold_count = CASE
    WHEN payment_reference IS NULL THEN COALESCE(sold_count, 0)
    ELSE COALESCE(sold_count, 0)
  END,
  quantity = CASE
    WHEN payment_reference IS NULL THEN GREATEST(COALESCE(quantity, 1), 1)
    ELSE 1
  END,
  ticket_code = CASE
    WHEN payment_reference IS NULL THEN NULL
    ELSE COALESCE(ticket_code, upper(substr(md5(coalesce(id::text, '') || random()::text || clock_timestamp()::text), 1, 12)))
  END,
  status = CASE
    WHEN payment_reference IS NULL THEN 'valid'
    WHEN lower(COALESCE(status, '')) = 'used' OR lower(COALESCE(usage_status, '')) = 'used' THEN 'used'
    ELSE 'valid'
  END,
  usage_status = CASE
    WHEN payment_reference IS NULL THEN 'unused'
    WHEN lower(COALESCE(usage_status, '')) = 'used' OR lower(COALESCE(status, '')) = 'used' THEN 'used'
    ELSE 'unused'
  END;

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
  INSERT INTO tickets (
    event_id,
    parent_ticket_id,
    ticket_kind,
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
    v_plan.name,
    v_plan.price,
    1,
    v_plan.admin_fee,
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
  RETURNING id, ticket_code;
END;
$$;