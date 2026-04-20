-- =============================================================================
-- Migration: Organizer Wallet System
-- 
-- Purpose:
--   1. Track earnings per organizer (aggregated across all events)
--   2. Track per-event revenue breakdown (votes, revenue, platform fees)
--   3. Calculate available balance (earnings - pending withdrawals)
--   4. Integrate with payment system to auto-update wallets on vote confirmation
-- =============================================================================

-- =============================================================================
-- 1. Organizer Wallets (Aggregated Earnings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizer_wallets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id UUID NOT NULL UNIQUE,
  total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_paid_votes BIGINT NOT NULL DEFAULT 0,
  platform_fees_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  CONSTRAINT organizer_wallets_organizer_id_fk
    FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organizer_wallets_organizer_id
  ON organizer_wallets (organizer_id);

-- =============================================================================
-- 1b. Organizer Wallet Withdrawals (base table created early for function refs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizer_withdrawals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id UUID NOT NULL,
  amount_requested NUMERIC(12, 2) NOT NULL,
  platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  platform_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  account_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT organizer_withdrawals_organizer_fk
    FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT organizer_withdrawals_amount_positive CHECK (amount_requested > 0),
  CONSTRAINT organizer_withdrawals_net_non_negative CHECK (net_amount >= 0),
  CONSTRAINT organizer_withdrawals_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- =============================================================================
-- 2. Per-Event Earnings Breakdown
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizer_event_earnings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id UUID NOT NULL,
  event_id TEXT NOT NULL,
  total_votes BIGINT NOT NULL DEFAULT 0,
  paid_votes BIGINT NOT NULL DEFAULT 0,
  free_votes BIGINT NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 10,
  platform_fee_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  CONSTRAINT organizer_event_earnings_unique
    UNIQUE(organizer_id, event_id),
  CONSTRAINT organizer_event_earnings_organizer_id_fk
    FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organizer_event_earnings_organizer_id
  ON organizer_event_earnings (organizer_id);

CREATE INDEX IF NOT EXISTS idx_organizer_event_earnings_event_id
  ON organizer_event_earnings (event_id);

CREATE INDEX IF NOT EXISTS idx_organizer_event_earnings_updated
  ON organizer_event_earnings (updated_at DESC);

-- =============================================================================
-- 3. Helper: Initialize wallet for organizer (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION initialize_organizer_wallet(p_organizer_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO organizer_wallets (organizer_id, total_revenue, platform_fees_deducted, net_balance)
  VALUES (p_organizer_id, 0, 0, 0)
  ON CONFLICT (organizer_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. Helper: Get available balance (wallet balance - pending withdrawals)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_organizer_available_balance(p_organizer_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_net_balance NUMERIC;
  v_pending_withdrawals NUMERIC;
BEGIN
  -- Get current net balance
  SELECT net_balance INTO v_net_balance
  FROM organizer_wallets
  WHERE organizer_id = p_organizer_id;
  
  IF v_net_balance IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get sum of pending withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending_withdrawals
  FROM organizer_withdrawals
  WHERE organizer_id = p_organizer_id
    AND status IN ('pending', 'approved');
  
  -- Return available (balance - pending)
  RETURN GREATEST(v_net_balance - v_pending_withdrawals, 0);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. Update Per-Event Earnings on Vote Creation
--    Called when a vote is confirmed (paid vote creates payment record)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_event_earnings_on_vote(
  p_organizer_id UUID,
  p_event_id TEXT,
  p_amount_paid NUMERIC,
  p_vote_type TEXT DEFAULT 'free'
)
RETURNS VOID AS $$
DECLARE
  v_platform_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  -- Get platform fee percentage from settings
  SELECT COALESCE(platform_fee_percent, 10) INTO v_platform_fee_percent
  FROM platform_settings
  LIMIT 1;
  
  -- Calculate fee and net (only for paid votes)
  v_fee_amount := CASE 
    WHEN p_vote_type = 'paid' AND p_amount_paid > 0 THEN (p_amount_paid * v_platform_fee_percent / 100)
    ELSE 0
  END;
  
  v_net_amount := p_amount_paid - v_fee_amount;
  
  -- Insert or update event earnings
  INSERT INTO organizer_event_earnings (
    organizer_id,
    event_id,
    total_votes,
    paid_votes,
    free_votes,
    total_revenue,
    platform_fee_percent,
    platform_fee_deducted,
    net_earnings,
    updated_at
  )
  VALUES (
    p_organizer_id,
    p_event_id,
    1,
    CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    p_amount_paid,
    v_platform_fee_percent,
    v_fee_amount,
    v_net_amount,
    timezone('utc', now())
  )
  ON CONFLICT (organizer_id, event_id) DO UPDATE SET
    total_votes = organizer_event_earnings.total_votes + 1,
    paid_votes = organizer_event_earnings.paid_votes + CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    free_votes = organizer_event_earnings.free_votes + CASE WHEN p_vote_type = 'free' THEN 1 ELSE 0 END,
    total_revenue = organizer_event_earnings.total_revenue + p_amount_paid,
    platform_fee_deducted = organizer_event_earnings.platform_fee_deducted + v_fee_amount,
    net_earnings = organizer_event_earnings.net_earnings + v_net_amount,
    updated_at = timezone('utc', now());
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. Update Organizer Wallet on Vote Confirmation
--    Called after update_event_earnings_on_vote
-- =============================================================================

CREATE OR REPLACE FUNCTION update_organizer_wallet_on_vote(
  p_organizer_id UUID,
  p_amount_paid NUMERIC,
  p_vote_type TEXT DEFAULT 'free'
)
RETURNS VOID AS $$
DECLARE
  v_platform_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  -- Initialize wallet if doesn't exist
  PERFORM initialize_organizer_wallet(p_organizer_id);
  
  -- Get platform fee percentage
  SELECT COALESCE(platform_fee_percent, 10) INTO v_platform_fee_percent
  FROM platform_settings
  LIMIT 1;
  
  -- Calculate fee and net (only for paid votes)
  v_fee_amount := CASE 
    WHEN p_vote_type = 'paid' AND p_amount_paid > 0 THEN (p_amount_paid * v_platform_fee_percent / 100)
    ELSE 0
  END;
  
  v_net_amount := p_amount_paid - v_fee_amount;
  
  -- Update organizer wallet
  UPDATE organizer_wallets
  SET
    total_revenue = total_revenue + p_amount_paid,
    total_paid_votes = total_paid_votes + CASE WHEN p_vote_type = 'paid' THEN 1 ELSE 0 END,
    platform_fees_deducted = platform_fees_deducted + v_fee_amount,
    net_balance = net_balance + v_net_amount,
    last_updated = timezone('utc', now())
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. Get Wallet Summary for Organizer
-- =============================================================================

CREATE OR REPLACE FUNCTION get_organizer_wallet_summary(p_organizer_id UUID)
RETURNS TABLE(
  total_revenue NUMERIC,
  total_paid_votes BIGINT,
  platform_fees_deducted NUMERIC,
  net_balance NUMERIC,
  available_balance NUMERIC,
  pending_withdrawals NUMERIC,
  last_updated TIMESTAMPTZ
) AS $$
DECLARE
  v_pending NUMERIC;
BEGIN
  -- Get pending withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM organizer_withdrawals
  WHERE organizer_id = p_organizer_id
    AND status IN ('pending', 'approved');
  
  -- Return wallet summary
  RETURN QUERY
  SELECT
    ow.total_revenue,
    ow.total_paid_votes,
    ow.platform_fees_deducted,
    ow.net_balance,
    GREATEST(ow.net_balance - v_pending, 0) AS available_balance,
    v_pending AS pending_withdrawals,
    ow.last_updated
  FROM organizer_wallets ow
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 8. Get Per-Event Earnings
-- =============================================================================

CREATE OR REPLACE FUNCTION get_organizer_event_earnings(p_organizer_id UUID)
RETURNS TABLE(
  event_id TEXT,
  total_votes BIGINT,
  paid_votes BIGINT,
  free_votes BIGINT,
  total_revenue NUMERIC,
  platform_fee_percent NUMERIC,
  platform_fee_deducted NUMERIC,
  net_earnings NUMERIC,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oee.event_id,
    oee.total_votes,
    oee.paid_votes,
    oee.free_votes,
    oee.total_revenue,
    oee.platform_fee_percent,
    oee.platform_fee_deducted,
    oee.net_earnings,
    oee.updated_at
  FROM organizer_event_earnings oee
  WHERE oee.organizer_id = p_organizer_id
  ORDER BY oee.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 9. Trigger: Auto-link payments to organizer wallet
--    When a paid vote is confirmed, update wallet and event earnings
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_link_payment_to_organizer_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_organizer_id UUID;
  v_vote_type TEXT;
  v_amount_paid NUMERIC;
BEGIN
  -- Only process confirmed/processed payments
  IF NEW.status NOT IN ('processed', 'success') OR NEW.vote_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get vote details
  SELECT v.vote_type, COALESCE(v.amount_paid, 0) INTO v_vote_type, v_amount_paid
  FROM votes v
  WHERE v.id::text = NEW.vote_id;
  
  IF v_vote_type IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get organizer from event
  SELECT e.organizer_id INTO v_organizer_id
  FROM events e
  WHERE e.id = NEW.event_id;
  
  IF v_organizer_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Update event earnings and organizer wallet
  PERFORM update_event_earnings_on_vote(v_organizer_id, NEW.event_id, v_amount_paid, v_vote_type);
  PERFORM update_organizer_wallet_on_vote(v_organizer_id, v_amount_paid, v_vote_type);
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_payment_to_organizer_wallet ON payments;
CREATE TRIGGER trg_link_payment_to_organizer_wallet
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_link_payment_to_organizer_wallet();

-- =============================================================================
-- 10. Backfill: Initialize wallets for existing organizers
-- =============================================================================

INSERT INTO organizer_wallets (organizer_id)
SELECT DISTINCT organizer_id
FROM events
WHERE organizer_id IS NOT NULL
  AND organizer_id NOT IN (SELECT organizer_id FROM organizer_wallets)
ON CONFLICT (organizer_id) DO NOTHING;

-- =============================================================================
-- 11. Backfill: Populate event earnings from existing votes
-- =============================================================================

INSERT INTO organizer_event_earnings (
  organizer_id,
  event_id,
  total_votes,
  paid_votes,
  free_votes,
  total_revenue,
  platform_fee_percent,
  platform_fee_deducted,
  net_earnings,
  created_at,
  updated_at
)
SELECT
  e.organizer_id,
  e.id AS event_id,
  COUNT(*) AS total_votes,
  COUNT(CASE WHEN v.vote_type = 'paid' THEN 1 END) AS paid_votes,
  COUNT(CASE WHEN v.vote_type = 'free' THEN 1 END) AS free_votes,
  COALESCE(SUM(v.amount_paid), 0) AS total_revenue,
  COALESCE(ps.platform_fee_percent, 10) AS platform_fee_percent,
  COALESCE(SUM(CASE 
    WHEN v.vote_type = 'paid' AND v.amount_paid > 0
    THEN (v.amount_paid * COALESCE(ps.platform_fee_percent, 10) / 100)
    ELSE 0
  END), 0) AS platform_fee_deducted,
  COALESCE(SUM(CASE 
    WHEN v.vote_type = 'paid' AND v.amount_paid > 0
    THEN v.amount_paid - (v.amount_paid * COALESCE(ps.platform_fee_percent, 10) / 100)
    ELSE 0
  END), 0) AS net_earnings,
  COALESCE(MIN(v.created_at), timezone('utc', now())) AS created_at,
  COALESCE(MAX(v.created_at), timezone('utc', now())) AS updated_at
FROM events e
LEFT JOIN votes v ON v.event_id = e.id
LEFT JOIN platform_settings ps ON TRUE
WHERE e.organizer_id IS NOT NULL
GROUP BY e.organizer_id, e.id, ps.platform_fee_percent
ON CONFLICT (organizer_id, event_id) DO UPDATE SET
  total_votes = EXCLUDED.total_votes,
  paid_votes = EXCLUDED.paid_votes,
  free_votes = EXCLUDED.free_votes,
  total_revenue = EXCLUDED.total_revenue,
  platform_fee_deducted = EXCLUDED.platform_fee_deducted,
  net_earnings = EXCLUDED.net_earnings,
  updated_at = EXCLUDED.updated_at;

-- =============================================================================
-- 12. Backfill: Update organizer wallets from event earnings
-- =============================================================================

UPDATE organizer_wallets ow
SET
  total_revenue = subq.total_revenue,
  total_paid_votes = subq.total_paid_votes,
  platform_fees_deducted = subq.platform_fees_deducted,
  net_balance = subq.net_earnings,
  last_updated = timezone('utc', now())
FROM (
  SELECT
    organizer_id,
    COALESCE(SUM(total_revenue), 0) AS total_revenue,
    COALESCE(SUM(paid_votes), 0) AS total_paid_votes,
    COALESCE(SUM(platform_fee_deducted), 0) AS platform_fees_deducted,
    COALESCE(SUM(net_earnings), 0) AS net_earnings
  FROM organizer_event_earnings
  GROUP BY organizer_id
) subq
WHERE ow.organizer_id = subq.organizer_id;

-- =============================================================================
-- 13. Admin Revenue Tracking (Platform Fee per Transaction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_revenue_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  payment_reference TEXT,
  event_id TEXT NOT NULL,
  event_title TEXT,
  organizer_id UUID,
  vote_id TEXT,
  vote_type TEXT NOT NULL DEFAULT 'paid',
  gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 10,
  platform_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  organizer_net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Keep compatibility if the table already exists with BIGINT payment_id.
ALTER TABLE admin_revenue_transactions
  ALTER COLUMN payment_id TYPE TEXT USING payment_id::text;

CREATE INDEX IF NOT EXISTS idx_admin_revenue_transactions_event_id
  ON admin_revenue_transactions (event_id);

CREATE INDEX IF NOT EXISTS idx_admin_revenue_transactions_processed_at
  ON admin_revenue_transactions (processed_at DESC);

-- =============================================================================
-- 14. Admin Revenue Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION get_admin_revenue_summary()
RETURNS TABLE(
  total_platform_revenue NUMERIC,
  total_gross_revenue NUMERIC,
  total_transactions BIGINT,
  last_transaction_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(platform_fee_amount), 0) AS total_platform_revenue,
    COALESCE(SUM(gross_amount), 0) AS total_gross_revenue,
    COUNT(*)::BIGINT AS total_transactions,
    MAX(processed_at) AS last_transaction_at
  FROM admin_revenue_transactions;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_admin_revenue_by_event()
RETURNS TABLE(
  event_id TEXT,
  event_title TEXT,
  total_platform_revenue NUMERIC,
  total_gross_revenue NUMERIC,
  total_transactions BIGINT,
  last_transaction_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    art.event_id,
    COALESCE(MAX(art.event_title), 'Untitled Event') AS event_title,
    COALESCE(SUM(art.platform_fee_amount), 0) AS total_platform_revenue,
    COALESCE(SUM(art.gross_amount), 0) AS total_gross_revenue,
    COUNT(*)::BIGINT AS total_transactions,
    MAX(art.processed_at) AS last_transaction_at
  FROM admin_revenue_transactions art
  GROUP BY art.event_id
  ORDER BY total_platform_revenue DESC, total_transactions DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 15. Trigger: Capture platform fee per processed payment
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_capture_admin_revenue_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vote_type TEXT;
  v_vote_amount NUMERIC;
  v_platform_fee_percent NUMERIC;
  v_gross_amount NUMERIC;
  v_platform_fee_amount NUMERIC;
  v_event_title TEXT;
  v_organizer_id UUID;
BEGIN
  -- Capture only completed payments linked to a vote.
  IF NEW.status NOT IN ('processed', 'success') OR NEW.vote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vote_type, COALESCE(amount_paid, 0)
  INTO v_vote_type, v_vote_amount
  FROM votes
  WHERE id::text = NEW.vote_id;

  IF v_vote_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(platform_fee_percent, 10)
  INTO v_platform_fee_percent
  FROM platform_settings
  LIMIT 1;

  SELECT e.title, e.organizer_id
  INTO v_event_title, v_organizer_id
  FROM events e
  WHERE e.id = NEW.event_id;

  v_gross_amount := COALESCE(NEW.amount, v_vote_amount, 0);

  v_platform_fee_amount := CASE
    WHEN v_vote_type = 'paid' AND v_gross_amount > 0
      THEN (v_gross_amount * v_platform_fee_percent / 100)
    ELSE 0
  END;

  INSERT INTO admin_revenue_transactions (
    payment_id,
    payment_reference,
    event_id,
    event_title,
    organizer_id,
    vote_id,
    vote_type,
    gross_amount,
    platform_fee_percent,
    platform_fee_amount,
    organizer_net_amount,
    processed_at
  )
  VALUES (
    NEW.id::text,
    NEW.reference,
    NEW.event_id,
    v_event_title,
    v_organizer_id,
    NEW.vote_id,
    v_vote_type,
    v_gross_amount,
    v_platform_fee_percent,
    v_platform_fee_amount,
    (v_gross_amount - v_platform_fee_amount),
    COALESCE(NEW.processed_at, NEW.verified_at, NEW.updated_at, NEW.created_at, timezone('utc', now()))
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_admin_revenue_transaction ON payments;
CREATE TRIGGER trg_capture_admin_revenue_transaction
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_capture_admin_revenue_transaction();

-- =============================================================================
-- 16. Backfill: Capture admin revenue from existing processed payments
-- =============================================================================

INSERT INTO admin_revenue_transactions (
  payment_id,
  payment_reference,
  event_id,
  event_title,
  organizer_id,
  vote_id,
  vote_type,
  gross_amount,
  platform_fee_percent,
  platform_fee_amount,
  organizer_net_amount,
  processed_at
)
SELECT
  p.id::text AS payment_id,
  p.reference AS payment_reference,
  p.event_id,
  e.title AS event_title,
  e.organizer_id,
  p.vote_id,
  COALESCE(v.vote_type, 'paid') AS vote_type,
  COALESCE(p.amount, v.amount_paid, 0) AS gross_amount,
  COALESCE(ps.platform_fee_percent, 10) AS platform_fee_percent,
  CASE
    WHEN COALESCE(v.vote_type, 'paid') = 'paid' AND COALESCE(p.amount, v.amount_paid, 0) > 0
      THEN (COALESCE(p.amount, v.amount_paid, 0) * COALESCE(ps.platform_fee_percent, 10) / 100)
    ELSE 0
  END AS platform_fee_amount,
  CASE
    WHEN COALESCE(v.vote_type, 'paid') = 'paid' AND COALESCE(p.amount, v.amount_paid, 0) > 0
      THEN (COALESCE(p.amount, v.amount_paid, 0) - (COALESCE(p.amount, v.amount_paid, 0) * COALESCE(ps.platform_fee_percent, 10) / 100))
    ELSE 0
  END AS organizer_net_amount,
  COALESCE(p.processed_at, p.verified_at, p.updated_at, p.created_at, timezone('utc', now())) AS processed_at
FROM payments p
LEFT JOIN votes v ON v.id::text = p.vote_id
LEFT JOIN events e ON e.id = p.event_id
LEFT JOIN platform_settings ps ON TRUE
WHERE p.status IN ('processed', 'success')
  AND p.vote_id IS NOT NULL
ON CONFLICT (payment_id) DO NOTHING;

-- =============================================================================
-- 17. Organizer Wallet Withdrawals (Request + History)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizer_withdrawals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id UUID NOT NULL,
  amount_requested NUMERIC(12, 2) NOT NULL,
  platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  platform_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  account_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT organizer_withdrawals_organizer_fk
    FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT organizer_withdrawals_amount_positive CHECK (amount_requested > 0),
  CONSTRAINT organizer_withdrawals_net_non_negative CHECK (net_amount >= 0),
  CONSTRAINT organizer_withdrawals_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_organizer
  ON organizer_withdrawals (organizer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_status
  ON organizer_withdrawals (status, created_at DESC);

CREATE OR REPLACE FUNCTION organizer_withdrawals_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizer_withdrawals_set_updated_at ON organizer_withdrawals;
CREATE TRIGGER trg_organizer_withdrawals_set_updated_at
  BEFORE UPDATE ON organizer_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION organizer_withdrawals_set_updated_at();

CREATE OR REPLACE FUNCTION request_organizer_withdrawal(
  p_organizer_id UUID,
  p_amount NUMERIC,
  p_method TEXT DEFAULT 'bank_transfer',
  p_account_details JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  withdrawal_id BIGINT,
  amount_requested NUMERIC,
  platform_fee_amount NUMERIC,
  net_amount NUMERIC,
  status TEXT,
  requested_at TIMESTAMPTZ
) AS $$
DECLARE
  v_available NUMERIC;
  v_fee_percent NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  SELECT get_organizer_available_balance(p_organizer_id) INTO v_available;

  IF p_amount > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  SELECT COALESCE(platform_fee_percent, 10)
  INTO v_fee_percent
  FROM platform_settings
  LIMIT 1;

  v_fee := (p_amount * v_fee_percent / 100);
  v_net := GREATEST(p_amount - v_fee, 0);

  RETURN QUERY
  INSERT INTO organizer_withdrawals (
    organizer_id,
    amount_requested,
    platform_fee_percent,
    platform_fee_amount,
    net_amount,
    method,
    account_details,
    status,
    requested_at
  )
  VALUES (
    p_organizer_id,
    p_amount,
    v_fee_percent,
    v_fee,
    v_net,
    COALESCE(NULLIF(trim(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    timezone('utc', now())
  )
  RETURNING
    id,
    organizer_withdrawals.amount_requested,
    organizer_withdrawals.platform_fee_amount,
    organizer_withdrawals.net_amount,
    organizer_withdrawals.status,
    organizer_withdrawals.requested_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_organizer_withdrawal_history(
  p_organizer_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id BIGINT,
  amount_requested NUMERIC,
  platform_fee_percent NUMERIC,
  platform_fee_amount NUMERIC,
  net_amount NUMERIC,
  method TEXT,
  account_details JSONB,
  status TEXT,
  admin_note TEXT,
  requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ow.id,
    ow.amount_requested,
    ow.platform_fee_percent,
    ow.platform_fee_amount,
    ow.net_amount,
    ow.method,
    ow.account_details,
    ow.status,
    ow.admin_note,
    ow.requested_at,
    ow.approved_at,
    ow.processed_at,
    ow.created_at
  FROM organizer_withdrawals ow
  WHERE ow.organizer_id = p_organizer_id
  ORDER BY ow.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql;
