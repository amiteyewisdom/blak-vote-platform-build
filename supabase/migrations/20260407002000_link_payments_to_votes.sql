-- =============================================================================
-- Migration: payment confirmation + payment-to-vote linkage
--
-- Purpose:
--   1. Persist every payment attempt before redirecting to Paystack.
--   2. Link each confirmed payment to exactly one vote row.
--   3. Enforce unique transaction references at the database level.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT,
  event_id TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'paystack',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS candidate_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voter_email TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voter_phone TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS authorization_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS access_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS vote_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_unique
  ON payments (reference)
  WHERE reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_vote_id_unique
  ON payments (vote_id)
  WHERE vote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_event_id ON payments (event_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_transaction_id_unique
  ON votes (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION payments_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_set_updated_at ON payments;
CREATE TRIGGER trg_payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION payments_set_updated_at();

-- =============================================================================
-- Payment Safeguards: Abuse Prevention, Fraud Detection, Stale Cleanup
-- =============================================================================

-- SAFEGUARD 1: Prevent duplicate payments for same candidate in same event
-- A voter cannot have two unprocessed payments (pending or success) for the same candidate
CREATE OR REPLACE FUNCTION trg_prevent_duplicate_payment_for_candidate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_payment BIGINT;
BEGIN
  IF NEW.status IN ('pending', 'success') AND NEW.voter_phone IS NOT NULL THEN
    SELECT id INTO existing_payment
    FROM payments
    WHERE event_id = NEW.event_id
      AND candidate_id = NEW.candidate_id
      AND voter_phone = NEW.voter_phone
      AND status IN ('pending', 'success')
      AND id != NEW.id
      AND created_at > now() - interval '24 hours'
    LIMIT 1;

    IF existing_payment IS NOT NULL THEN
      RAISE EXCEPTION 'Duplicate payment: voter already has pending or recent payment for this candidate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_payment_for_candidate ON payments;
CREATE TRIGGER trg_prevent_duplicate_payment_for_candidate
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_prevent_duplicate_payment_for_candidate();

-- SAFEGUARD 2: Mark stale payments as failed (auto-cleanup after 30 minutes)
-- Payments stuck in "pending" state for >30 min are likely abandoned
CREATE OR REPLACE FUNCTION mark_stale_payments_as_failed()
RETURNS TABLE(marked_count INT) AS $$
DECLARE
  count_updated INT;
BEGIN
  UPDATE payments
  SET status = 'failed', gateway_status = 'stale_timeout'
  WHERE status = 'pending'
    AND created_at < now() - interval '30 minutes'
    AND vote_id IS NULL;

  GET DIAGNOSTICS count_updated = ROW_COUNT;
  RETURN QUERY SELECT count_updated;
END;
$$ LANGUAGE plpgsql;

-- SAFEGUARD 3: Rate-limit pending payments per voter
-- Function to check if a voter exceeds max pending payments
CREATE OR REPLACE FUNCTION check_voter_pending_payment_limit(
  p_voter_phone TEXT,
  p_max_pending INT DEFAULT 5
)
RETURNS TABLE(pending_count INT, limit_exceeded BOOLEAN) AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM payments
  WHERE voter_phone = p_voter_phone
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  RETURN QUERY SELECT v_count, v_count >= p_max_pending;
END;
$$ LANGUAGE plpgsql;

-- SAFEGUARD 4: Detect fraud pattern - max N payments per voter per day
CREATE OR REPLACE FUNCTION check_fraud_pattern_daily_limit(
  p_voter_phone TEXT,
  p_max_daily_attempts INT DEFAULT 10
)
RETURNS TABLE(attempts_today INT, limit_exceeded BOOLEAN) AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM payments
  WHERE voter_phone = p_voter_phone
    AND created_at > now() - interval '24 hours'
    AND status IN ('pending', 'failed', 'success');

  RETURN QUERY SELECT v_count, v_count >= p_max_daily_attempts;
END;
$$ LANGUAGE plpgsql;

-- SAFEGUARD 5: Track failed payment attempts per IP (from metadata)
CREATE TABLE IF NOT EXISTS payment_failed_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voter_phone TEXT,
  event_id TEXT,
  reason TEXT,
  gateway_status TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  -- Indexes for abuse tracking
  UNIQUE(voter_phone, event_id, failed_at)
);

CREATE INDEX IF NOT EXISTS idx_payment_failed_attempts_voter_event 
  ON payment_failed_attempts (voter_phone, event_id, failed_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_failed_attempts_voter 
  ON payment_failed_attempts (voter_phone, failed_at DESC);

-- Log failed payment attempts for fraud analytics
CREATE OR REPLACE FUNCTION trg_log_failed_payment_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    INSERT INTO payment_failed_attempts (voter_phone, event_id, reason, gateway_status)
    VALUES (NEW.voter_phone, NEW.event_id, 'Payment failed', NEW.gateway_status)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_failed_payment_attempt ON payments;
CREATE TRIGGER trg_log_failed_payment_attempt
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_log_failed_payment_attempt();

-- SAFEGUARD 6: Function to clean up expired or ghost payments
-- Orphaned payments with no vote and no recent webhook activity
CREATE OR REPLACE FUNCTION cleanup_ghost_payments(
  p_age_minutes INT DEFAULT 60
)
RETURNS TABLE(deleted_count INT, archived_count INT) AS $$
DECLARE
  v_deleted INT;
  v_archived INT;
BEGIN
  -- Archive payments with no vote after N minutes
  UPDATE payments
  SET status = 'abandoned', gateway_status = 'no_vote_created'
  WHERE status IN ('success', 'pending')
    AND vote_id IS NULL
    AND updated_at < now() - (make_interval(mins => p_age_minutes))
    AND NOT (status = 'abandoned');

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- Hard-delete old failed payment records (> 90 days)
  DELETE FROM payments
  WHERE status = 'failed'
    AND created_at < now() - interval '90 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_archived;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Indexes for Payment Safety and Performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_payments_voter_phone_status
  ON payments (voter_phone, status, created_at DESC)
  WHERE status IN ('pending', 'success');

CREATE INDEX IF NOT EXISTS idx_payments_voter_phone_event_candidate
  ON payments (voter_phone, event_id, candidate_id, status)
  WHERE status IN ('pending', 'success');

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_failed_attempts_recent
  ON payment_failed_attempts (voter_phone, failed_at DESC);