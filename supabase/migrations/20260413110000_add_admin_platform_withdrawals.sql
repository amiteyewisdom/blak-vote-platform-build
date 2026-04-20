CREATE TABLE IF NOT EXISTS admin_platform_withdrawals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requested_by_user_id UUID NOT NULL,
  amount_requested NUMERIC(12, 2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  account_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT admin_platform_withdrawals_requested_by_fk
    FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT admin_platform_withdrawals_amount_positive CHECK (amount_requested > 0),
  CONSTRAINT admin_platform_withdrawals_status_valid
    CHECK (status IN ('pending', 'processed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_admin_platform_withdrawals_created_at
  ON admin_platform_withdrawals (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_platform_withdrawals_status
  ON admin_platform_withdrawals (status, created_at DESC);

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

CREATE OR REPLACE FUNCTION get_admin_available_platform_balance()
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_platform_revenue NUMERIC;
  v_reserved_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(platform_fee_amount), 0)
  INTO v_total_platform_revenue
  FROM admin_revenue_transactions;

  SELECT COALESCE(SUM(amount_requested), 0)
  INTO v_reserved_amount
  FROM admin_platform_withdrawals
  WHERE status IN ('pending', 'processed');

  RETURN GREATEST(v_total_platform_revenue - v_reserved_amount, 0);
END;
$$;

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

  SELECT get_admin_available_platform_balance()
  INTO v_available;

  IF p_amount > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'Insufficient available platform balance';
  END IF;

  RETURN QUERY
  INSERT INTO admin_platform_withdrawals (
    requested_by_user_id,
    amount_requested,
    method,
    account_details,
    status,
    requested_at
  )
  VALUES (
    p_admin_user_id,
    p_amount,
    COALESCE(NULLIF(trim(p_method), ''), 'bank_transfer'),
    COALESCE(p_account_details, '{}'::jsonb),
    'pending',
    timezone('utc', now())
  )
  RETURNING
    id,
    admin_platform_withdrawals.amount_requested,
    admin_platform_withdrawals.status,
    admin_platform_withdrawals.requested_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_admin_platform_withdrawal_history(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id BIGINT,
  requested_by_user_id UUID,
  amount_requested NUMERIC,
  method TEXT,
  status TEXT,
  admin_note TEXT,
  requested_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    apw.id,
    apw.requested_by_user_id,
    apw.amount_requested,
    apw.method,
    apw.status,
    apw.admin_note,
    apw.requested_at,
    apw.processed_at,
    apw.created_at
  FROM admin_platform_withdrawals apw
  ORDER BY apw.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql;