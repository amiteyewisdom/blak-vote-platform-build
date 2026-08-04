-- =============================================================================
-- Migration: Deduct processed platform payouts from the admin platform wallet
--
-- Issue:
--   admin_platform_withdrawals rows were being marked as processed, but the
--   admin_platform_wallet singleton was never debited. It only tracked gross
--   fee earnings, so the wallet balance kept growing even after payouts.
--
-- Fix:
--   1. Allow status = 'processed' on admin_platform_withdrawals and migrate
--      rows that were already paid but stored as 'approved' because the old
--      constraint rejected 'processed'.
--   2. Add pending / withdrawn / available balance columns to
--      admin_platform_wallet.
--   3. Replace sync_admin_platform_wallet_from_ledger() so it computes the
--      net available balance from the ledger and the withdrawal table.
--   4. Add a trigger on admin_platform_withdrawals that maintains the wallet
--      buckets whenever a payout is requested, processed, or rejected.
--   5. Backfill the wallet so existing processed/pending withdrawals are
--      reflected immediately.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend admin_platform_wallet with withdrawal tracking
-- -----------------------------------------------------------------------------
ALTER TABLE admin_platform_wallet
  ADD COLUMN IF NOT EXISTS pending_admin_withdrawals NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_platform_balance NUMERIC(15, 2) NOT NULL DEFAULT 0;

-- Ensure the singleton row exists before we update it.
INSERT INTO admin_platform_wallet (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Fix the status constraint mismatch and migrate paid-out rows
-- -----------------------------------------------------------------------------
-- Production ran the first platform-withdrawals migration, whose CHECK only
-- allowed ('pending','approved','rejected','cancelled'). The process route tried
-- to set status='processed', failed the constraint, and fell back to 'approved'.
-- That is why paid platform payouts did not show in the "Processed" bucket and
-- were not debited from the wallet.
ALTER TABLE admin_platform_withdrawals
  DROP CONSTRAINT IF EXISTS admin_platform_withdrawals_status_valid;

ALTER TABLE admin_platform_withdrawals
  ADD CONSTRAINT admin_platform_withdrawals_status_valid
  CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'cancelled'));

-- Any payout that already has a processed_at timestamp is truly paid out.
UPDATE admin_platform_withdrawals
SET status = 'processed'
WHERE processed_at IS NOT NULL
  AND status <> 'processed';

-- Normalize the available balance function so approved payouts are also reserved.
DROP FUNCTION IF EXISTS get_admin_available_platform_balance();

CREATE OR REPLACE FUNCTION get_admin_available_platform_balance()
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_platform_revenue NUMERIC;
  v_reserved_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(platform_fee_amount), 0) INTO v_total_platform_revenue
  FROM admin_revenue_transactions;

  SELECT COALESCE(SUM(amount_requested), 0) INTO v_reserved_amount
  FROM admin_platform_withdrawals
  WHERE status IN ('pending', 'approved', 'processed');

  RETURN GREATEST(v_total_platform_revenue - v_reserved_amount, 0);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Recompute admin platform wallet from the ledger
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS sync_admin_platform_wallet_from_ledger();

CREATE OR REPLACE FUNCTION sync_admin_platform_wallet_from_ledger()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO admin_platform_wallet (
    id,
    platform_voting_earnings,
    platform_ticket_earnings,
    total_platform_earnings,
    pending_admin_withdrawals,
    total_withdrawn,
    available_platform_balance,
    last_updated
  )
  SELECT
    1,
    COALESCE(SUM(CASE WHEN payment_context = 'vote'   THEN platform_fee_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0),
    COALESCE(SUM(platform_fee_amount), 0),
    COALESCE((SELECT SUM(amount_requested) FROM admin_platform_withdrawals WHERE status IN ('pending', 'approved')), 0),
    COALESCE((SELECT SUM(amount_requested) FROM admin_platform_withdrawals WHERE status = 'processed'), 0),
    GREATEST(
      COALESCE(SUM(platform_fee_amount), 0)
      - COALESCE((SELECT SUM(amount_requested) FROM admin_platform_withdrawals WHERE status IN ('pending', 'approved', 'processed')), 0),
      0
    ),
    timezone('utc', now())
  FROM admin_revenue_transactions
  ON CONFLICT (id) DO UPDATE SET
    platform_voting_earnings   = EXCLUDED.platform_voting_earnings,
    platform_ticket_earnings   = EXCLUDED.platform_ticket_earnings,
    total_platform_earnings    = EXCLUDED.total_platform_earnings,
    pending_admin_withdrawals  = EXCLUDED.pending_admin_withdrawals,
    total_withdrawn            = EXCLUDED.total_withdrawn,
    available_platform_balance = EXCLUDED.available_platform_balance,
    last_updated               = EXCLUDED.last_updated;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Trigger to keep admin_platform_wallet in sync with withdrawal state
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_platform_wallet_withdrawal_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_amount NUMERIC;
BEGIN
  v_amount := COALESCE(NEW.amount_requested, OLD.amount_requested, 0);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('pending', 'approved') THEN
      UPDATE admin_platform_wallet SET
        pending_admin_withdrawals  = pending_admin_withdrawals + v_amount,
        available_platform_balance = GREATEST(available_platform_balance - v_amount, 0),
        last_updated               = timezone('utc', now())
      WHERE id = 1;
    ELSIF NEW.status = 'processed' THEN
      UPDATE admin_platform_wallet SET
        total_withdrawn            = total_withdrawn + v_amount,
        last_updated               = timezone('utc', now())
      WHERE id = 1;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Remove amount from the old status bucket.
    IF OLD.status IN ('pending', 'approved') THEN
      UPDATE admin_platform_wallet
      SET pending_admin_withdrawals = GREATEST(pending_admin_withdrawals - v_amount, 0)
      WHERE id = 1;
    ELSIF OLD.status = 'processed' THEN
      UPDATE admin_platform_wallet
      SET total_withdrawn = GREATEST(total_withdrawn - v_amount, 0)
      WHERE id = 1;
    END IF;

    -- Add amount to the new status bucket.
    IF NEW.status IN ('pending', 'approved') THEN
      UPDATE admin_platform_wallet
      SET pending_admin_withdrawals = pending_admin_withdrawals + v_amount
      WHERE id = 1;
    ELSIF NEW.status = 'processed' THEN
      UPDATE admin_platform_wallet
      SET total_withdrawn = total_withdrawn + v_amount
      WHERE id = 1;
    END IF;

    -- Restore available balance when a reserved/processed withdrawal is rejected or cancelled.
    IF OLD.status IN ('pending', 'approved', 'processed') AND NEW.status IN ('rejected', 'cancelled') THEN
      UPDATE admin_platform_wallet
      SET available_platform_balance = available_platform_balance + v_amount
      WHERE id = 1;
    -- Reserve available balance when a previously rejected/cancelled withdrawal is re-opened.
    ELSIF OLD.status IN ('rejected', 'cancelled') AND NEW.status IN ('pending', 'approved') THEN
      UPDATE admin_platform_wallet
      SET available_platform_balance = GREATEST(available_platform_balance - v_amount, 0)
      WHERE id = 1;
    END IF;

    UPDATE admin_platform_wallet SET last_updated = timezone('utc', now()) WHERE id = 1;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('pending', 'approved') THEN
      UPDATE admin_platform_wallet SET
        pending_admin_withdrawals  = GREATEST(pending_admin_withdrawals - v_amount, 0),
        available_platform_balance = available_platform_balance + v_amount,
        last_updated               = timezone('utc', now())
      WHERE id = 1;
    ELSIF OLD.status = 'processed' THEN
      UPDATE admin_platform_wallet SET
        total_withdrawn            = GREATEST(total_withdrawn - v_amount, 0),
        available_platform_balance = available_platform_balance + v_amount,
        last_updated               = timezone('utc', now())
      WHERE id = 1;
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_platform_wallet_withdrawal_sync ON admin_platform_withdrawals;

CREATE TRIGGER trg_admin_platform_wallet_withdrawal_sync
  AFTER INSERT OR UPDATE OR DELETE ON admin_platform_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION admin_platform_wallet_withdrawal_sync();

-- -----------------------------------------------------------------------------
-- 5. Backfill existing data
-- -----------------------------------------------------------------------------
SELECT sync_admin_platform_wallet_from_ledger();
