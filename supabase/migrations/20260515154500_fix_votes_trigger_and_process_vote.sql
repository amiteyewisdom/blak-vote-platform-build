-- =============================================================================
-- Migration: Fix votes trigger + process_vote for deployed databases
--
-- Problems observed in production:
--   1. trg_increment_nomination_vote_count referenced NEW.nominee_id, but the
--      votes table does not have that column. Any INSERT into votes aborted.
--   2. process_vote inserted into votes.status, but votes has no status column.
--
-- This migration repairs both functions in-place for databases that already ran
-- the earlier broken migrations.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_increment_nomination_vote_count()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE nominations
  SET vote_count = COALESCE(vote_count, 0) + COALESCE(NEW.quantity, 1)
  WHERE id::TEXT = NEW.candidate_id::TEXT;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_vote(
  p_event_id        uuid,
  p_candidate_id    uuid,
  p_quantity        integer,
  p_voter_id        uuid    DEFAULT NULL,
  p_voter_phone     text    DEFAULT NULL,
  p_vote_source     text    DEFAULT 'online',
  p_payment_method  text    DEFAULT 'paystack',
  p_transaction_id  text    DEFAULT NULL,
  p_ip_address      text    DEFAULT NULL,
  p_amount_paid     numeric DEFAULT 0
)
RETURNS void
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
    p_voter_phone,
    p_vote_source
  );
END;
$$;
