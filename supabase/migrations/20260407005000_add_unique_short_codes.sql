-- =============================================================================
-- Migration: Unique short codes for events and candidates
--
-- Purpose:
--   1. Add short, human-friendly codes for offline voting references.
--   2. Guarantee uniqueness at the database level.
--   3. Auto-generate on insert so all creation flows are covered.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS short_code TEXT;

ALTER TABLE nominations
  ADD COLUMN IF NOT EXISTS short_code TEXT;

CREATE OR REPLACE FUNCTION generate_unique_short_code(
  p_table_name TEXT,
  p_column_name TEXT,
  p_prefix TEXT,
  p_length INTEGER DEFAULT 6
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;

    v_code := p_prefix || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, p_length));

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)',
      p_table_name,
      p_column_name
    )
    INTO v_exists
    USING v_code;

    IF NOT v_exists THEN
      RETURN v_code;
    END IF;

    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Unable to generate unique short code for %.%', p_table_name, p_column_name;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trg_events_set_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.short_code IS NULL OR btrim(NEW.short_code) = '' THEN
    NEW.short_code := generate_unique_short_code('events', 'short_code', 'EV', 6);
  END IF;

  -- Keep existing integrations working by defaulting event_code to short_code when absent.
  IF NEW.event_code IS NULL OR btrim(NEW.event_code) = '' THEN
    NEW.event_code := NEW.short_code;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_nominations_set_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.short_code IS NULL OR btrim(NEW.short_code) = '' THEN
    NEW.short_code := generate_unique_short_code('nominations', 'short_code', 'CD', 6);
  END IF;

  -- Keep existing surfaces that use voting_code intact.
  IF NEW.voting_code IS NULL OR btrim(NEW.voting_code) = '' THEN
    NEW.voting_code := NEW.short_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_set_short_code ON events;
CREATE TRIGGER trg_events_set_short_code
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION trg_events_set_short_code();

DROP TRIGGER IF EXISTS trg_nominations_set_short_code ON nominations;
CREATE TRIGGER trg_nominations_set_short_code
  BEFORE INSERT OR UPDATE ON nominations
  FOR EACH ROW
  EXECUTE FUNCTION trg_nominations_set_short_code();

-- Backfill existing rows.
UPDATE events
SET short_code = generate_unique_short_code('events', 'short_code', 'EV', 6)
WHERE short_code IS NULL OR btrim(short_code) = '';

UPDATE events
SET event_code = short_code
WHERE (event_code IS NULL OR btrim(event_code) = '')
  AND short_code IS NOT NULL;

UPDATE nominations
SET short_code = generate_unique_short_code('nominations', 'short_code', 'CD', 6)
WHERE short_code IS NULL OR btrim(short_code) = '';

UPDATE nominations
SET voting_code = short_code
WHERE (voting_code IS NULL OR btrim(voting_code) = '')
  AND short_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_short_code_unique
  ON events (short_code)
  WHERE short_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nominations_short_code_unique
  ON nominations (short_code)
  WHERE short_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_code_unique
  ON events (event_code)
  WHERE event_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nominations_voting_code_unique
  ON nominations (voting_code)
  WHERE voting_code IS NOT NULL;
