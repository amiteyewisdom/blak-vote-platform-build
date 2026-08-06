-- =============================================================================
-- Migration: Add configurable payment-provider service fees
--
-- These are deducted from the platform fee before recording net revenue,
-- so the organizer still pays the configured platform fee, but the gateway
-- charge is borne by the platform out of that fee.
-- =============================================================================

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS paystack_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.95,
  ADD COLUMN IF NOT EXISTS nalo_fee_percent     NUMERIC(5, 2) NOT NULL DEFAULT 2.00;

-- Add a constraint so provider fees can never exceed 100%.
ALTER TABLE platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_provider_fees_valid;

ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_provider_fees_valid
  CHECK (paystack_fee_percent >= 0 AND paystack_fee_percent <= 100
         AND nalo_fee_percent >= 0 AND nalo_fee_percent <= 100);

-- Seed defaults on the existing singleton row.
UPDATE platform_settings
SET
  paystack_fee_percent = COALESCE(paystack_fee_percent, 1.95),
  nalo_fee_percent     = COALESCE(nalo_fee_percent, 2.00),
  updated_at           = timezone('utc', now());
