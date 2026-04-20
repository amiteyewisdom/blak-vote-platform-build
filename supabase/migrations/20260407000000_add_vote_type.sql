-- =============================================================================
-- Migration: add vote_type and is_manual to votes
--
-- vote_type is derived from the existing vote_source / payment_method /
-- amount_paid columns that process_vote already writes, so no RPC signature
-- change is needed.  A BEFORE trigger enforces:
--   1. is_manual + vote_type are always consistent with vote_source /
--      payment_method regardless of the caller.
--   2. Manual votes can never carry a non-zero amount_paid, preventing
--      manual entries from inflating revenue figures.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add columns to votes
-- ---------------------------------------------------------------------------
ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS vote_type TEXT
    NOT NULL DEFAULT 'free'
    CHECK (vote_type IN ('free', 'paid', 'manual'));

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows
--    Uses the already-stored vote_source / payment_method / amount_paid
--    values to retroactively assign the correct type.
-- ---------------------------------------------------------------------------
UPDATE votes
SET
  is_manual = (
    vote_source  = 'manual' OR
    payment_method = 'manual'
  ),
  vote_type = CASE
    WHEN vote_source = 'manual' OR payment_method = 'manual' THEN 'manual'
    WHEN amount_paid > 0                                      THEN 'paid'
    ELSE                                                           'free'
  END;

-- ---------------------------------------------------------------------------
-- 3. Trigger function — runs BEFORE INSERT OR UPDATE
--    Derives is_manual and vote_type from immutable source-of-truth columns
--    so they can never be set inconsistently by any caller.
--    Also zeroes amount_paid on manual rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION votes_set_vote_type()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  -- Derive is_manual from vote_source / payment_method.
  NEW.is_manual := (
    NEW.vote_source    = 'manual' OR
    NEW.payment_method = 'manual'
  );

  -- Derive vote_type from is_manual and amount_paid.
  NEW.vote_type := CASE
    WHEN NEW.is_manual      THEN 'manual'
    WHEN NEW.amount_paid > 0 THEN 'paid'
    ELSE                         'free'
  END;

  -- Hard-zero amount_paid for manual votes so they never affect revenue.
  IF NEW.is_manual THEN
    NEW.amount_paid := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if this migration is re-run.
DROP TRIGGER IF EXISTS trg_votes_set_vote_type ON votes;

CREATE TRIGGER trg_votes_set_vote_type
  BEFORE INSERT OR UPDATE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION votes_set_vote_type();

-- ---------------------------------------------------------------------------
-- 4. Useful indexes for analytics queries that filter by type
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_votes_vote_type  ON votes (vote_type);
CREATE INDEX IF NOT EXISTS idx_votes_is_manual  ON votes (is_manual);
