-- =============================================================================
-- Migration: Fix process_vote and nominations.vote_count update
--
-- Problems:
--   1. process_vote RPC ignores p_amount_paid → inserts NULL → violates NOT NULL
--   2. nominations.vote_count is never incremented (only process_vote did it,
--      and it was failing). Fallback direct-inserts into votes but misses the
--      count update, so the nominee leaderboard never reflects USSD/MoMo votes.
--
-- Fixes:
--   1. Patch votes_set_vote_type BEFORE trigger to coerce NULL amount_paid → 0
--      so any caller (including the old broken RPC) can never violate the
--      NOT NULL constraint.
--   2. Add AFTER INSERT trigger on votes that atomically increments
--      nominations.vote_count by the inserted quantity. This makes every
--      insert path (process_vote RPC, fallback direct-insert, manual admin)
--      automatically keep the count in sync.
--   3. Redefine process_vote to accept and use p_amount_paid correctly, and
--      remove its manual nominations.vote_count update (the new trigger
--      handles it, avoiding double-counting).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Patch votes_set_vote_type: coerce NULL amount_paid to 0
--    (prevents NOT NULL constraint violation from any caller)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION votes_set_vote_type()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  -- Coerce NULL amount_paid to 0 so the NOT NULL constraint is never violated.
  NEW.amount_paid := COALESCE(NEW.amount_paid, 0);

  -- Derive is_manual from vote_source / payment_method.
  NEW.is_manual := (
    NEW.vote_source    = 'manual' OR
    NEW.payment_method = 'manual'
  );

  -- Derive vote_type from is_manual and amount_paid.
  NEW.vote_type := CASE
    WHEN NEW.is_manual       THEN 'manual'
    WHEN NEW.amount_paid > 0 THEN 'paid'
    ELSE                          'free'
  END;

  -- Hard-zero amount_paid for manual votes so they never affect revenue.
  IF NEW.is_manual THEN
    NEW.amount_paid := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger: increment nominations.vote_count on every vote INSERT
--    Handles all insert paths: process_vote RPC, fallback, manual admin.
--    NOTE: process_vote must NOT also update vote_count to avoid double-counting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_increment_nomination_vote_count()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  -- Prefer candidate_id; fall back to nominee_id for schema variants.
  UPDATE nominations
  SET vote_count = COALESCE(vote_count, 0) + COALESCE(NEW.quantity, 1)
  WHERE id::TEXT = COALESCE(NEW.candidate_id, NEW.nominee_id)::TEXT;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_nomination_vote_count ON votes;
CREATE TRIGGER trg_increment_nomination_vote_count
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION trg_increment_nomination_vote_count();

-- ---------------------------------------------------------------------------
-- 3. Redefine process_vote to correctly use p_amount_paid
--    Nomination vote_count is updated by the trigger above — no manual UPDATE
--    here to avoid double-counting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_vote(
  p_event_id        UUID,
  p_candidate_id    UUID,
  p_quantity        INT,
  p_voter_id        UUID    DEFAULT NULL,
  p_voter_phone     TEXT    DEFAULT NULL,
  p_vote_source     TEXT    DEFAULT 'online',
  p_payment_method  TEXT    DEFAULT 'paystack',
  p_transaction_id  TEXT    DEFAULT NULL,
  p_ip_address      TEXT    DEFAULT NULL,
  p_amount_paid     NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO votes (
    event_id,
    candidate_id,
    voter_id,
    quantity,
    payment_method,
    amount_paid,
    transaction_id,
    status,
    voter_phone,
    vote_source
  ) VALUES (
    p_event_id,
    p_candidate_id,
    p_voter_id,
    p_quantity,
    p_payment_method,
    COALESCE(p_amount_paid, 0),
    p_transaction_id,
    'paid',
    p_voter_phone,
    p_vote_source
  );
  -- nominations.vote_count is incremented by trg_increment_nomination_vote_count
END;
$$;
