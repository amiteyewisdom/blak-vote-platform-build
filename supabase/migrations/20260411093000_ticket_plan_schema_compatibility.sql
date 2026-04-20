-- =============================================================================
-- Migration: Ticket plan schema compatibility
--
-- Purpose:
--   Normalize legacy tickets schema so the ticket plan API can operate even when
--   the original refactor migration was only partially applied or older legacy
--   constraints are still present.
-- =============================================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_kind TEXT NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS parent_ticket_id UUID,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tickets
  ALTER COLUMN quantity SET DEFAULT 1,
  ALTER COLUMN sold_count SET DEFAULT 0,
  ALTER COLUMN admin_fee SET DEFAULT 0,
  ALTER COLUMN ticket_kind SET DEFAULT 'issued',
  ALTER COLUMN usage_status SET DEFAULT 'unused',
  ALTER COLUMN ticket_type SET DEFAULT 'free';

ALTER TABLE tickets
  ALTER COLUMN ticket_type DROP NOT NULL,
  ALTER COLUMN ticket_code DROP NOT NULL,
  ALTER COLUMN payment_reference DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_status_check'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_status_valid'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_status_valid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_usage_status_check'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_usage_status_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_usage_status_valid'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_usage_status_valid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_ticket_type_check'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_ticket_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_ticket_type_valid'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT tickets_ticket_type_valid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_status_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_status_valid
      CHECK (status IN ('valid', 'used', 'unused'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_usage_status_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_usage_status_valid
      CHECK (usage_status IN ('unused', 'used'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_ticket_kind_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_ticket_kind_valid
      CHECK (ticket_kind IN ('plan', 'issued'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_ticket_type_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_ticket_type_valid
      CHECK (ticket_type IS NULL OR ticket_type IN ('free', 'paid'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_parent_ticket_id_fkey'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_parent_ticket_id_fkey
      FOREIGN KEY (parent_ticket_id)
      REFERENCES tickets(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE tickets
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

UPDATE tickets
SET admin_fee = 0
WHERE admin_fee IS NULL;

UPDATE tickets
SET ticket_type = CASE
  WHEN COALESCE(price, 0) > 0 THEN 'paid'
  ELSE 'free'
END
WHERE ticket_type IS NULL OR lower(COALESCE(ticket_type, '')) NOT IN ('free', 'paid');

UPDATE tickets
SET usage_status = CASE
  WHEN lower(COALESCE(usage_status, '')) = 'used' OR lower(COALESCE(status, '')) = 'used' THEN 'used'
  ELSE 'unused'
END
WHERE usage_status IS NULL OR lower(COALESCE(usage_status, '')) NOT IN ('unused', 'used');

UPDATE tickets
SET status = CASE
  WHEN lower(COALESCE(status, '')) = 'used' OR lower(COALESCE(usage_status, '')) = 'used' THEN 'used'
  ELSE 'valid'
END
WHERE status IS NULL OR lower(COALESCE(status, '')) NOT IN ('valid', 'used', 'unused');

UPDATE tickets
SET ticket_kind = CASE
  WHEN payment_reference IS NULL THEN 'plan'
  ELSE 'issued'
END
WHERE ticket_kind IS NULL OR lower(COALESCE(ticket_kind, '')) NOT IN ('plan', 'issued');

UPDATE tickets
SET sold_count = 0
WHERE sold_count IS NULL;

UPDATE tickets
SET ticket_code = NULL
WHERE ticket_kind = 'plan';

UPDATE tickets
SET ticket_code = upper(substr(md5(coalesce(id::text, '') || random()::text || clock_timestamp()::text), 1, 12))
WHERE ticket_kind = 'issued'
  AND ticket_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_kind_event
  ON tickets (ticket_kind, event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_parent_ticket_id
  ON tickets (parent_ticket_id, created_at DESC);

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
  RETURNING id, ticket_code;
END;
$$;
