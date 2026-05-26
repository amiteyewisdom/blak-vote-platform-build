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

-- =============================================================================
-- Admin revenue RPC functions
-- These are called by GET /api/admin/revenue and displayed on the analytics page.
-- They read directly from admin_revenue_transactions so the numbers always match
-- the corrected ledger data (including the backfill above).
-- =============================================================================

DROP FUNCTION IF EXISTS get_admin_revenue_summary();
CREATE OR REPLACE FUNCTION get_admin_revenue_summary()
RETURNS TABLE (
  total_platform_revenue  NUMERIC,
  vote_platform_revenue   NUMERIC,
  ticket_platform_revenue NUMERIC,
  total_gross_revenue     NUMERIC,
  total_transactions      BIGINT,
  last_transaction_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(platform_fee_amount), 0)                                                              AS total_platform_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'vote'   THEN platform_fee_amount ELSE 0 END), 0)        AS vote_platform_revenue,
    COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0)        AS ticket_platform_revenue,
    COALESCE(SUM(gross_amount), 0)                                                                     AS total_gross_revenue,
    COUNT(*)::BIGINT                                                                                   AS total_transactions,
    MAX(processed_at)                                                                                  AS last_transaction_at
  FROM admin_revenue_transactions;
$$;

DROP FUNCTION IF EXISTS get_admin_revenue_by_event();
CREATE OR REPLACE FUNCTION get_admin_revenue_by_event()
RETURNS TABLE (
  event_id                TEXT,
  event_title             TEXT,
  total_platform_revenue  NUMERIC,
  vote_platform_revenue   NUMERIC,
  ticket_platform_revenue NUMERIC,
  total_gross_revenue     NUMERIC,
  total_transactions      BIGINT,
  last_transaction_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    art.event_id,
    COALESCE(e.title, art.event_title, art.event_id)                                                   AS event_title,
    COALESCE(SUM(art.platform_fee_amount), 0)                                                          AS total_platform_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'vote'   THEN art.platform_fee_amount ELSE 0 END), 0) AS vote_platform_revenue,
    COALESCE(SUM(CASE WHEN art.payment_context = 'ticket' THEN art.platform_fee_amount ELSE 0 END), 0) AS ticket_platform_revenue,
    COALESCE(SUM(art.gross_amount), 0)                                                                 AS total_gross_revenue,
    COUNT(*)::BIGINT                                                                                   AS total_transactions,
    MAX(art.processed_at)                                                                              AS last_transaction_at
  FROM admin_revenue_transactions art
  LEFT JOIN events e ON e.id::TEXT = art.event_id
  GROUP BY art.event_id, COALESCE(e.title, art.event_title, art.event_id)
  ORDER BY total_platform_revenue DESC;
$$;

DO $$
BEGIN
  DROP FUNCTION IF EXISTS get_admin_revenue_source_summary();

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'admin_revenue_transactions'
      AND column_name  = 'payment_provider'
  ) THEN
    EXECUTE '
      CREATE FUNCTION get_admin_revenue_source_summary()
      RETURNS TABLE (
        provider               TEXT,
        total_platform_revenue NUMERIC,
        total_gross_revenue    NUMERIC,
        total_transactions     BIGINT
      )
      LANGUAGE sql STABLE AS $f$
        SELECT
          COALESCE(payment_provider, ''unknown'') AS provider,
          COALESCE(SUM(platform_fee_amount), 0)   AS total_platform_revenue,
          COALESCE(SUM(gross_amount), 0)           AS total_gross_revenue,
          COUNT(*)::BIGINT                         AS total_transactions
        FROM admin_revenue_transactions
        GROUP BY COALESCE(payment_provider, ''unknown'')
        ORDER BY total_platform_revenue DESC;
      $f$';
  ELSE
    EXECUTE '
      CREATE FUNCTION get_admin_revenue_source_summary()
      RETURNS TABLE (
        provider               TEXT,
        total_platform_revenue NUMERIC,
        total_gross_revenue    NUMERIC,
        total_transactions     BIGINT
      )
      LANGUAGE sql STABLE AS $f$
        SELECT
          ''unknown''::TEXT                       AS provider,
          COALESCE(SUM(platform_fee_amount), 0)   AS total_platform_revenue,
          COALESCE(SUM(gross_amount), 0)           AS total_gross_revenue,
          COUNT(*)::BIGINT                         AS total_transactions
        FROM admin_revenue_transactions;
      $f$';
  END IF;
END;
$$;
