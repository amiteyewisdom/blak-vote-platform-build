-- =============================================================================
-- Migration: Admin Platform Withdrawals
--
-- Purpose:
--   1. Track admin platform fee earnings
--   2. Allow admins to request platform payouts
--   3. Track payout status and history
-- =============================================================================

-- Admin Platform Withdrawals Table
CREATE TABLE IF NOT EXISTS admin_platform_withdrawals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount_requested NUMERIC(12, 2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  account_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_by_admin_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT admin_platform_withdrawals_amount_positive CHECK (amount_requested > 0),
  CONSTRAINT admin_platform_withdrawals_status_valid
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT admin_platform_withdrawals_admin_fk
    FOREIGN KEY (requested_by_admin_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_platform_withdrawals_status
  ON admin_platform_withdrawals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_platform_withdrawals_requested_by
  ON admin_platform_withdrawals (requested_by_admin_id, created_at DESC);

-- Get total platform earnings (admin revenue)
CREATE OR REPLACE FUNCTION get_admin_platform_balance()
RETURNS TABLE(
  total_platform_earnings NUMERIC,
  total_pending_withdrawals NUMERIC,
  total_approved_withdrawals NUMERIC,
  available_balance NUMERIC
) AS $$
DECLARE
  v_total_earnings NUMERIC;
  v_pending NUMERIC;
  v_approved NUMERIC;
  v_processed NUMERIC;
BEGIN
  -- Get total platform fee earnings
  SELECT COALESCE(SUM(platform_fee_amount), 0) INTO v_total_earnings
  FROM admin_revenue_transactions;
  
  -- Get pending withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM admin_platform_withdrawals
  WHERE status = 'pending';
  
  -- Get approved withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_approved
  FROM admin_platform_withdrawals
  WHERE status = 'approved';
  
  -- Get processed withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_processed
  FROM admin_platform_withdrawals
  WHERE status = 'processed';
  
  RETURN QUERY SELECT
    v_total_earnings,
    v_pending,
    v_approved,
    GREATEST(v_total_earnings - v_pending - v_approved - v_processed, 0);
END;
$$ LANGUAGE plpgsql;

-- Get available platform balance for withdrawal
CREATE OR REPLACE FUNCTION get_admin_available_platform_balance()
RETURNS NUMERIC AS $$
DECLARE
  v_total_earnings NUMERIC;
  v_pending NUMERIC;
  v_approved NUMERIC;
  v_processed NUMERIC;
BEGIN
  -- Get total platform fee earnings
  SELECT COALESCE(SUM(platform_fee_amount), 0) INTO v_total_earnings
  FROM admin_revenue_transactions;
  
  -- Get pending withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM admin_platform_withdrawals
  WHERE status = 'pending';
  
  -- Get approved withdrawals
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_approved
  FROM admin_platform_withdrawals
  WHERE status = 'approved';
  
  -- Get processed withdrawals 
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_processed
  FROM admin_platform_withdrawals
  WHERE status = 'processed';
  
  RETURN GREATEST(v_total_earnings - v_pending - v_approved - v_processed, 0);
END;
$$ LANGUAGE plpgsql;

-- Request admin platform withdrawal
CREATE OR REPLACE FUNCTION request_admin_platform_withdrawal(
  p_admin_user_id UUID,
  p_amount NUMERIC,
  p_method TEXT DEFAULT 'bank_transfer',
  p_account_details JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  withdrawal_id BIGINT,
  amount_requested NUMERIC,
  status TEXT,
  requested_at TIMESTAMPTZ
) AS $$
DECLARE
  v_available NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  -- Get available balance
  SELECT get_admin_available_platform_balance() INTO v_available;

  IF p_amount > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  RETURN QUERY
  INSERT INTO admin_platform_withdrawals (
    amount_requested,
    method,
    account_details,
    status,
    requested_by_admin_id,
    requested_at
  )
  VALUES (
    p_amount,
    COALESCE(NULLIF(trim(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    p_admin_user_id,
    timezone('utc', now())
  )
  RETURNING
    id,
    admin_platform_withdrawals.amount_requested,
    admin_platform_withdrawals.status,
    admin_platform_withdrawals.requested_at;
END;
$$ LANGUAGE plpgsql;

-- Get admin platform withdrawal history
CREATE OR REPLACE FUNCTION get_admin_platform_withdrawal_history(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  withdrawal_id BIGINT,
  amount_requested NUMERIC,
  method TEXT,
  status TEXT,
  admin_note TEXT,
  requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    apw.id,
    apw.amount_requested,
    apw.method,
    apw.status,
    apw.admin_note,
    apw.requested_at,
    apw.approved_at,
    apw.processed_at
  FROM admin_platform_withdrawals apw
  ORDER BY apw.requested_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp on admin platform withdrawals
CREATE OR REPLACE FUNCTION admin_platform_withdrawals_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_platform_withdrawals_set_updated_at ON admin_platform_withdrawals;
CREATE TRIGGER trg_admin_platform_withdrawals_set_updated_at
  BEFORE UPDATE ON admin_platform_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION admin_platform_withdrawals_set_updated_at();
