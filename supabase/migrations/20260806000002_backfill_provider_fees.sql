-- =============================================================================
-- Migration: Backfill payment-provider fee deductions on historical revenue
--
-- Recomputes admin_revenue_transactions.platform_fee_amount and
-- organizer_net_amount so the gateway charge is deducted from the platform's
-- portion, not from the organizer's payout.
-- =============================================================================

-- Recompute existing rows using the configured provider fee.
-- platform_fee_percent on these rows holds the nominal platform fee; we
-- subtract the provider fee to get the net platform share.
WITH settings AS (
  SELECT
    COALESCE(paystack_fee_percent, 1.95) AS paystack_fee,
    COALESCE(nalo_fee_percent, 2.00)     AS nalo_fee
  FROM platform_settings
  LIMIT 1
)
UPDATE admin_revenue_transactions art
SET
  platform_fee_percent = GREATEST(art.platform_fee_percent - CASE
    WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
    ELSE s.paystack_fee
  END, 0),
  platform_fee_amount = GREATEST(
    art.gross_amount
    * GREATEST(art.platform_fee_percent - CASE
        WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
        ELSE s.paystack_fee
      END, 0)
    / 100,
    0
  )::NUMERIC(12, 2),
  organizer_net_amount = art.gross_amount - GREATEST(
    art.gross_amount
    * GREATEST(art.platform_fee_percent - CASE
        WHEN LOWER(COALESCE(art.payment_provider, 'paystack')) = 'nalo' THEN s.nalo_fee
        ELSE s.paystack_fee
      END, 0)
    / 100,
    0
  )::NUMERIC(12, 2)
FROM settings s
WHERE art.gross_amount > 0;

-- Refresh per-event earnings and organizer wallets from the corrected ledger.
SELECT recalculate_revenue_state();
