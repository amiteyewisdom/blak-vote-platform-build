-- Add uuid_ref column to nominations to support UUID-based lookups
-- This allows the code to use UUIDs while the DB still uses bigint primary keys

ALTER TABLE nominations
  ADD COLUMN IF NOT EXISTS uuid_ref text UNIQUE;

-- Create index for faster UUID lookups
CREATE INDEX IF NOT EXISTS idx_nominations_uuid_ref ON nominations(uuid_ref);

-- Backfill uuid_ref for existing nominations that don't have it
UPDATE nominations
SET uuid_ref = gen_random_uuid()::text
WHERE uuid_ref IS NULL;
