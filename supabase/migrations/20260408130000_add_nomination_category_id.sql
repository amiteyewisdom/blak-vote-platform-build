-- =============================================================================
-- Migration: Add nominations.category_id for organizer categorization
--
-- Purpose:
--   1. Allow nominees to be assigned to event categories.
--   2. Support organizer flow that requires category on nominee creation.
-- =============================================================================

ALTER TABLE nominations
  ADD COLUMN IF NOT EXISTS category_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nominations_category_id_fkey'
  ) THEN
    ALTER TABLE nominations
      ADD CONSTRAINT nominations_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES categories(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_nominations_category_id
  ON nominations (category_id);
