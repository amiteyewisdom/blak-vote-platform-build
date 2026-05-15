ALTER TABLE organizer_withdrawals
  ADD COLUMN IF NOT EXISTS payout_provider TEXT,
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS payout_recipient_code TEXT,
  ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payout_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE organizer_withdrawals
  DROP CONSTRAINT IF EXISTS organizer_withdrawals_status_valid;

ALTER TABLE organizer_withdrawals
  ADD CONSTRAINT organizer_withdrawals_status_valid
  CHECK (status IN ('pending', 'approved', 'pending_funds', 'processed', 'rejected', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_organizer_withdrawals_retry_queue
  ON organizer_withdrawals (status, approved_at, created_at)
  WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION get_organizer_wallet_summary(p_organizer_id UUID)
RETURNS TABLE(
  total_revenue NUMERIC,
  vote_revenue NUMERIC,
  ticket_revenue NUMERIC,
  total_paid_votes BIGINT,
  manual_votes BIGINT,
  paid_ticket_count BIGINT,
  platform_fees_deducted NUMERIC,
  vote_platform_fees_deducted NUMERIC,
  ticket_platform_fees_deducted NUMERIC,
  net_balance NUMERIC,
  available_balance NUMERIC,
  pending_withdrawals NUMERIC,
  last_updated TIMESTAMPTZ
) AS $$
DECLARE
  v_pending NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_pending
  FROM organizer_withdrawals
  WHERE organizer_id = p_organizer_id
    AND status IN ('pending', 'approved', 'pending_funds');

  RETURN QUERY
  SELECT
    ow.total_revenue,
    ow.vote_revenue,
    ow.ticket_revenue,
    ow.total_paid_votes,
    ow.manual_votes,
    ow.paid_ticket_count,
    ow.platform_fees_deducted,
    ow.vote_platform_fees_deducted,
    ow.ticket_platform_fees_deducted,
    ow.net_balance,
    GREATEST(ow.net_balance - v_pending, 0) AS available_balance,
    v_pending AS pending_withdrawals,
    ow.last_updated
  FROM organizer_wallets ow
  WHERE organizer_id = p_organizer_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_organizer_withdrawal_history(UUID, INTEGER, INTEGER);

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
  payout_provider TEXT,
  payout_reference TEXT,
  payout_recipient_code TEXT,
  payout_attempted_at TIMESTAMPTZ,
  payout_failure_reason TEXT,
  payout_metadata JSONB,
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
    ow.payout_provider,
    ow.payout_reference,
    ow.payout_recipient_code,
    ow.payout_attempted_at,
    ow.payout_failure_reason,
    ow.payout_metadata,
    ow.created_at
  FROM organizer_withdrawals ow
  WHERE ow.organizer_id = p_organizer_id
  ORDER BY ow.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql;