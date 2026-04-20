-- =============================================================================
-- Migration: Shorten event/nominee codes to 3 characters
--
-- Purpose:
--   1. Generate compact 3-char codes for events and nominees.
--   2. Keep short_code and legacy code columns (event_code/voting_code) aligned.
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_unique_short_code(
  p_table_name TEXT,
  p_column_name TEXT,
  p_prefix TEXT,
  p_length INTEGER DEFAULT 3
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
  v_alpha TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_alnum TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_idx INTEGER;
  v_body TEXT;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    v_body := '';

    -- Ensure at least one letter by forcing first character to alpha.
    v_idx := floor(random() * length(v_alpha))::INTEGER + 1;
    v_body := substr(v_alpha, v_idx, 1);

    WHILE char_length(v_body) < p_length LOOP
      v_idx := floor(random() * length(v_alnum))::INTEGER + 1;
      v_body := v_body || substr(v_alnum, v_idx, 1);
    END LOOP;

    v_code := COALESCE(p_prefix, '') || v_body;

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

    IF v_attempts > 200 THEN
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
    NEW.short_code := generate_unique_short_code('events', 'short_code', '', 3);
  END IF;

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
    NEW.short_code := generate_unique_short_code('nominations', 'short_code', '', 3);
  END IF;

  IF NEW.voting_code IS NULL OR btrim(NEW.voting_code) = '' THEN
    NEW.voting_code := NEW.short_code;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-compact existing non-3-char codes.
UPDATE events
SET short_code = generate_unique_short_code('events', 'short_code', '', 3)
WHERE short_code IS NULL OR btrim(short_code) = '' OR char_length(short_code) <> 3;

UPDATE events
SET event_code = short_code
WHERE event_code IS NULL OR btrim(event_code) = '' OR char_length(event_code) <> 3;

UPDATE nominations
SET short_code = generate_unique_short_code('nominations', 'short_code', '', 3)
WHERE short_code IS NULL OR btrim(short_code) = '' OR char_length(short_code) <> 3;

UPDATE nominations
SET voting_code = short_code
WHERE voting_code IS NULL OR btrim(voting_code) = '' OR char_length(voting_code) <> 3;
