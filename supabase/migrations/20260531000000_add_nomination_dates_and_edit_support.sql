-- =============================================================================
-- Migration: Nomination open/close dates on events + nominee editable fields
--
-- 1. Add nomination_open_date and nomination_close_date to events table
--    so organizers can set when public nominations are accepted.
-- 2. Ensure nominations.nominee_email, nominee_phone, bio are present
--    for the organizer edit/detail view.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nomination window columns on events
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS nomination_open_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nomination_close_date TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Ensure nominations has all fields needed for organizer editing/viewing
-- ---------------------------------------------------------------------------
ALTER TABLE nominations
  ADD COLUMN IF NOT EXISTS nominee_email TEXT,
  ADD COLUMN IF NOT EXISTS nominee_phone TEXT,
  ADD COLUMN IF NOT EXISTS bio          TEXT;

-- ---------------------------------------------------------------------------
-- 3. Indexes for fast lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_nomination_dates
  ON events (nomination_open_date, nomination_close_date)
  WHERE nomination_open_date IS NOT NULL OR nomination_close_date IS NOT NULL;
