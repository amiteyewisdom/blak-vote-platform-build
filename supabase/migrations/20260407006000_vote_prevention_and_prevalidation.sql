-- =============================================================================
-- Migration: Vote duplicate prevention + pre-insert validation
--
-- Purpose:
--   1. Prevent duplicate free votes at database level.
--   2. Validate vote integrity before insertion (candidate/event consistency).
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_validate_vote_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_effective_vote_type TEXT;
BEGIN
  -- Basic quantity guard.
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid vote quantity';
  END IF;

  -- Ensure candidate belongs to event and is still an approved candidate.
  IF NOT EXISTS (
    SELECT 1
    FROM nominations n
    WHERE n.id = NEW.candidate_id
      AND n.event_id = NEW.event_id
      AND n.status = 'candidate'
  ) THEN
    RAISE EXCEPTION 'Invalid candidate for event';
  END IF;

  v_effective_vote_type := COALESCE(
    NEW.vote_type,
    CASE
      WHEN COALESCE(NEW.is_manual, false) THEN 'manual'
      WHEN COALESCE(NEW.amount_paid, 0) > 0 THEN 'paid'
      ELSE 'free'
    END
  );

  -- Enforce single free vote per authenticated user per event.
  IF v_effective_vote_type = 'free'
     AND NOT COALESCE(NEW.is_manual, false)
     AND NEW.voter_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM votes v
       WHERE v.event_id = NEW.event_id
         AND v.voter_id = NEW.voter_id
         AND COALESCE(v.is_manual, false) = false
         AND COALESCE(v.vote_type, 'free') = 'free'
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'Duplicate free vote for user and event';
  END IF;

  -- Enforce single free vote per phone number per event for guest voters.
  IF v_effective_vote_type = 'free'
     AND NOT COALESCE(NEW.is_manual, false)
     AND NEW.voter_phone IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM votes v
       WHERE v.event_id = NEW.event_id
         AND v.voter_phone = NEW.voter_phone
         AND COALESCE(v.is_manual, false) = false
         AND COALESCE(v.vote_type, 'free') = 'free'
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'Duplicate free vote for phone and event';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_vote_before_insert ON votes;
CREATE TRIGGER trg_validate_vote_before_insert
  BEFORE INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION trg_validate_vote_before_insert();
