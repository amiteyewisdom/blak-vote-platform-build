-- =============================================================================
-- 0. Ensure platform_settings has a valid default fee.
--    COALESCE(platform_fee_percent, 10) in DB functions treats NULL as 10,
--    but stores nothing — so 0 slips through as a "real" value.
--    This upsert seeds 10% if the row is missing, and fixes accidental 0 %
--    rows that were written before the admin configured a real fee.
-- =============================================================================

-- Insert a default row if none exists
INSERT INTO platform_settings (platform_fee_percent, updated_at)
SELECT 10, timezone('utc', now())
WHERE NOT EXISTS (SELECT 1 FROM platform_settings LIMIT 1);

-- Fix platform_fee_percent where never intentionally set (NULL or 0)
UPDATE platform_settings
SET
  platform_fee_percent = 10,
  updated_at           = timezone('utc', now())
WHERE platform_fee_percent IS NULL
   OR platform_fee_percent = 0;

-- Fix ticketing_commission_percent only if the column exists in this DB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'platform_settings'
      AND column_name  = 'ticketing_commission_percent'
  ) THEN
    UPDATE platform_settings
    SET ticketing_commission_percent = 10,
        updated_at                   = timezone('utc', now())
    WHERE ticketing_commission_percent IS NULL
       OR ticketing_commission_percent = 0;
  END IF;
END;
$$;

-- =============================================================================
-- Migration: Backfill correct platform fees in admin_revenue_transactions
--
-- Root cause fixed: NULL platform_fee_percent in platform_settings was being
-- converted via Number(null) = 0, causing all fees to be stored as 0%.
-- This migration recomputes platform_fee_percent, platform_fee_amount, and
-- organizer_net_amount for every row where gross_amount > 0 but
-- platform_fee_amount = 0 AND the organizer has no explicit 0% fee override.
-- =============================================================================

DO $$
DECLARE
  r             RECORD;
  v_fee_percent NUMERIC;
  v_fee_amount  NUMERIC;
  v_net_amount  NUMERIC;
BEGIN
  FOR r IN
    SELECT
      art.id,
      art.organizer_id,
      art.gross_amount,
      art.payment_context
    FROM admin_revenue_transactions art
    WHERE art.platform_fee_amount = 0
      AND art.gross_amount        > 0
      -- Skip organizers with a deliberate 0 % vote-fee override
      AND NOT EXISTS (
        SELECT 1
        FROM organizer_fee_overrides ofo
        WHERE ofo.organizer_user_id = art.organizer_id
          AND ofo.platform_fee_percent IS NOT NULL
          AND ofo.platform_fee_percent = 0
      )
  LOOP
    -- Use the same DB functions that the application uses for fee resolution
    IF r.organizer_id IS NOT NULL THEN
      BEGIN
        IF r.payment_context = 'ticket' THEN
          SELECT get_effective_ticketing_fee_percent(r.organizer_id) INTO v_fee_percent;
        ELSE
          SELECT get_effective_platform_fee_percent(r.organizer_id) INTO v_fee_percent;
        END IF;
      EXCEPTION WHEN others THEN
        v_fee_percent := NULL;
      END;
    END IF;

    -- Final fallback: global setting → hardcoded 10 %
    IF v_fee_percent IS NULL OR v_fee_percent = 0 THEN
      SELECT COALESCE(platform_fee_percent, 10)
      INTO   v_fee_percent
      FROM   platform_settings
      LIMIT  1;
    END IF;

    v_fee_percent := COALESCE(v_fee_percent, 10);
    v_fee_amount  := ROUND((r.gross_amount * v_fee_percent / 100)::NUMERIC, 2);
    v_net_amount  := ROUND((r.gross_amount - v_fee_amount)::NUMERIC, 2);

    UPDATE admin_revenue_transactions
    SET
      platform_fee_percent = v_fee_percent,
      platform_fee_amount  = v_fee_amount,
      organizer_net_amount = v_net_amount
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Re-sync wallet balances so withdrawable_balance / total_earnings reflect
-- the now-corrected fee data.
SELECT sync_organizer_wallet_from_ledger();
SELECT sync_admin_platform_wallet_from_ledger();
