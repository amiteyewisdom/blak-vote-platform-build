-- =============================================================================
-- Migration: immutable vote audit log
--
-- Purpose:
--   1. Track every inserted vote row in a dedicated append-only audit table.
--   2. Capture vote actor data (voter, candidate, timestamp, type).
--   3. Capture which authenticated user created manual votes.
--   4. Prevent audit records from being updated or deleted.
--
-- Notes:
--   - Logging happens from a DB trigger on the votes table, so free, paid,
--     webhook, and manual vote flows all stay inside the existing endpoints.
--   - Manual actor data is passed through a small context table keyed by the
--     same transaction_id used by process_vote.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vote_manual_audit_context (
  transaction_id TEXT PRIMARY KEY,
  added_by_user_id TEXT NOT NULL,
  manual_entry_mode TEXT NOT NULL CHECK (manual_entry_mode IN ('manual', 'bulk')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS vote_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vote_id TEXT NOT NULL,
  event_id TEXT,
  candidate_id TEXT,
  voter_id TEXT,
  voter_phone TEXT,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('free', 'paid', 'manual')),
  is_manual BOOLEAN NOT NULL DEFAULT false,
  quantity INTEGER,
  vote_source TEXT,
  payment_method TEXT,
  transaction_id TEXT,
  added_by_user_id TEXT,
  manual_entry_mode TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT vote_audit_log_vote_id_unique UNIQUE (vote_id)
);

CREATE INDEX IF NOT EXISTS idx_vote_audit_log_event_id ON vote_audit_log (event_id);
CREATE INDEX IF NOT EXISTS idx_vote_audit_log_candidate_id ON vote_audit_log (candidate_id);
CREATE INDEX IF NOT EXISTS idx_vote_audit_log_voter_id ON vote_audit_log (voter_id);
CREATE INDEX IF NOT EXISTS idx_vote_audit_log_occurred_at ON vote_audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_vote_audit_log_vote_type ON vote_audit_log (vote_type);
CREATE INDEX IF NOT EXISTS idx_vote_manual_audit_context_created_at
  ON vote_manual_audit_context (created_at);

CREATE OR REPLACE FUNCTION prevent_vote_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'vote_audit_log is append-only and cannot be modified';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_vote_audit_log_update ON vote_audit_log;
CREATE TRIGGER trg_prevent_vote_audit_log_update
  BEFORE UPDATE ON vote_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_vote_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_vote_audit_log_delete ON vote_audit_log;
CREATE TRIGGER trg_prevent_vote_audit_log_delete
  BEFORE DELETE ON vote_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_vote_audit_log_mutation();

CREATE OR REPLACE FUNCTION write_vote_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  vote_row JSONB := to_jsonb(NEW);
  manual_context vote_manual_audit_context%ROWTYPE;
  vote_transaction_id TEXT := vote_row ->> 'transaction_id';
BEGIN
  IF vote_transaction_id IS NOT NULL THEN
    SELECT *
    INTO manual_context
    FROM vote_manual_audit_context
    WHERE transaction_id = vote_transaction_id
    LIMIT 1;
  END IF;

  INSERT INTO vote_audit_log (
    vote_id,
    event_id,
    candidate_id,
    voter_id,
    voter_phone,
    vote_type,
    is_manual,
    quantity,
    vote_source,
    payment_method,
    transaction_id,
    added_by_user_id,
    manual_entry_mode,
    occurred_at
  )
  VALUES (
    vote_row ->> 'id',
    vote_row ->> 'event_id',
    COALESCE(vote_row ->> 'candidate_id', vote_row ->> 'nominee_id'),
    vote_row ->> 'voter_id',
    vote_row ->> 'voter_phone',
    COALESCE(vote_row ->> 'vote_type', 'free'),
    COALESCE((vote_row ->> 'is_manual')::BOOLEAN, FALSE),
    COALESCE((vote_row ->> 'quantity')::INTEGER, 1),
    vote_row ->> 'vote_source',
    vote_row ->> 'payment_method',
    vote_transaction_id,
    manual_context.added_by_user_id,
    manual_context.manual_entry_mode,
    COALESCE((vote_row ->> 'created_at')::TIMESTAMPTZ, timezone('utc', now()))
  );

  IF manual_context.transaction_id IS NOT NULL THEN
    DELETE FROM vote_manual_audit_context
    WHERE transaction_id = manual_context.transaction_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_write_vote_audit_log ON votes;
CREATE TRIGGER trg_write_vote_audit_log
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION write_vote_audit_log();