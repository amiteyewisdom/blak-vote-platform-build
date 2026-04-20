-- =============================================================================
-- Migration: Ticket payment linkage + usage status
--
-- Purpose:
--   1. Link ticket purchases to verified payments (by payment reference).
--   2. Track ticket usage lifecycle with explicit used/unused state.
-- =============================================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usage_status TEXT NOT NULL DEFAULT 'unused',
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Keep usage status constrained and query-friendly.
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_payment_reference_unique
  ON tickets (payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_usage_status
  ON tickets (usage_status);

-- Backfill: previously purchased tickets default to unused unless already marked used.
UPDATE tickets
SET usage_status = CASE
    WHEN lower(COALESCE(status, '')) = 'used' THEN 'used'
    ELSE 'unused'
  END,
  used_at = CASE
    WHEN lower(COALESCE(status, '')) = 'used' AND used_at IS NULL THEN COALESCE(updated_at, created_at, timezone('utc', now()))
    ELSE used_at
  END,
  purchased_at = CASE
    WHEN lower(COALESCE(status, '')) = 'purchased' AND purchased_at IS NULL THEN COALESCE(updated_at, created_at, timezone('utc', now()))
    ELSE purchased_at
  END
WHERE usage_status IS NULL OR lower(COALESCE(status, '')) IN ('purchased', 'used');
