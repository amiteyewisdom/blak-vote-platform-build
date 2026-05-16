-- =============================================================================
-- Migration: Reconcile nomination vote counts to actual vote rows
--
-- Problem:
--   Some nominations are showing doubled paid votes even when only one vote row
--   exists. The safest fix is to stop incrementing blindly and instead derive
--   nominations.vote_count from the authoritative votes table.
--
-- Fix:
--   1. Make the AFTER INSERT trigger idempotent by recalculating the candidate's
--      total votes from the votes table on each insert.
--   2. Backfill all nomination vote counts to the real sum of votes.quantity.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_increment_nomination_vote_count()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE nominations
  SET vote_count = COALESCE((
    SELECT SUM(v.quantity)
    FROM votes v
    WHERE v.candidate_id::TEXT = NEW.candidate_id::TEXT
  ), 0)
  WHERE id::TEXT = NEW.candidate_id::TEXT;

  RETURN NEW;
END;
$$;

UPDATE nominations n
SET vote_count = COALESCE(v.total_votes, 0)
FROM (
  SELECT
    candidate_id::TEXT AS candidate_id,
    COALESCE(SUM(quantity), 0) AS total_votes
  FROM votes
  WHERE candidate_id IS NOT NULL
  GROUP BY candidate_id::TEXT
) v
WHERE n.id::TEXT = v.candidate_id;

UPDATE nominations n
SET vote_count = 0
WHERE COALESCE(n.vote_count, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM votes v
    WHERE v.candidate_id::TEXT = n.id::TEXT
  );
