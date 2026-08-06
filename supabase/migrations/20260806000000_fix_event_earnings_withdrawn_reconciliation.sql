-- =============================================================================
-- Migration: Fix per-event withdrawn bucket reconciliation
--
-- Issue:
--   The admin events list shows Revenue / Withdrawn / Available balance from
--   organizer_event_earnings, but withdrawn_vote_revenue and
--   withdrawn_ticket_revenue were not being reliably reconciled with
--   organizer_withdrawals. In particular:
--     1. recalculate_revenue_state() double-counted 'combined' withdrawals by
--        adding them to both vote and ticket buckets, while
--        process_organizer_withdrawal() only credits them to the vote bucket.
--     2. Active events that did not yet have an organizer_event_earnings row
--        could not receive backfilled withdrawn amounts.
--     3. The admin reconcile endpoint only synced organizer_wallets and the
--        admin_platform_wallet, never the per-event earnings table.
--
-- Fix:
--   1. Re-create recalculate_revenue_state() so it:
--        - Ensures an organizer_event_earnings row exists for every active event.
--        - Resets all revenue and withdrawn buckets before recomputing.
--        - Counts 'combined' withdrawals only toward the vote bucket, matching
--          process_organizer_withdrawal().
--        - Updates every active event row, not only rows that happen to have
--          matching votes/tickets/fees.
--   2. Backfill all historical data by invoking the rebuilt function.
--   3. Update the admin reconcile endpoint to also call recalculate_revenue_state()
--      so future drift can be repaired from the dashboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rebuild recalculate_revenue_state() with consistent, complete logic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_revenue_state()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Make sure every active event has a per-event earnings row.  This prevents
  -- the subsequent UPDATEs from silently skipping events that have withdrawals
  -- but no vote/ticket/fee activity yet.
  INSERT INTO organizer_event_earnings (organizer_id, event_id)
  SELECT DISTINCT COALESCE(o.user_id, e.organizer_id), e.id::TEXT
  FROM events e
  LEFT JOIN organizers o ON o.id = e.organizer_id
  WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
    AND NOT EXISTS (
      SELECT 1
      FROM organizer_event_earnings oee
      WHERE oee.organizer_id = COALESCE(o.user_id, e.organizer_id)
        AND oee.event_id = e.id::TEXT
    )
  ON CONFLICT (organizer_id, event_id) DO NOTHING;

  -- Reset all computed buckets to zero before recomputing from source tables.
  -- Withdrawn amounts are recomputed from organizer_withdrawals below.
  UPDATE organizer_event_earnings
  SET
    total_votes = 0,
    paid_votes = 0,
    free_votes = 0,
    manual_votes = 0,
    paid_ticket_count = 0,
    vote_revenue = 0,
    ticket_revenue = 0,
    total_revenue = 0,
    vote_platform_fee_deducted = 0,
    ticket_platform_fee_deducted = 0,
    platform_fee_deducted = 0,
    net_earnings = 0,
    vote_net_earnings = 0,
    ticket_net_earnings = 0,
    withdrawn_vote_revenue = 0,
    withdrawn_ticket_revenue = 0,
    updated_at = timezone('utc', now());

  -- Recompute per-event revenue, fees, and withdrawn buckets from the ledger.
  WITH active_events AS (
    -- Normalize events.organizer_id to auth.users.id, because the column can hold
    -- either the user UUID or the organizers record id.
    SELECT DISTINCT COALESCE(o.user_id, e.organizer_id) AS organizer_id, e.id::TEXT AS event_id
    FROM events e
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
  ),
  vote_metrics AS (
    SELECT
      COALESCE(o.user_id, e.organizer_id) AS organizer_id,
      v.event_id::TEXT AS event_id,
      COALESCE(SUM(v.quantity), 0)::BIGINT AS total_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.quantity ELSE 0 END), 0)::BIGINT AS paid_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'free' THEN v.quantity ELSE 0 END), 0)::BIGINT AS free_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'manual' THEN v.quantity ELSE 0 END), 0)::BIGINT AS manual_votes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'paid' THEN v.amount_paid ELSE 0 END), 0) AS vote_revenue
    FROM votes v
    JOIN events e ON e.id::TEXT = v.event_id::TEXT
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY COALESCE(o.user_id, e.organizer_id), v.event_id::TEXT
  ),
  ticket_metrics AS (
    SELECT
      COALESCE(o.user_id, e.organizer_id) AS organizer_id,
      t.event_id::TEXT AS event_id,
      COUNT(*)::BIGINT AS paid_ticket_count,
      COALESCE(SUM(CASE WHEN p.status IN ('processed', 'success', 'paid') THEN p.amount ELSE 0 END), 0) AS ticket_revenue
    FROM tickets t
    JOIN events e ON e.id::TEXT = t.event_id::TEXT
    LEFT JOIN payments p ON p.reference = t.payment_reference AND p.payment_context = 'ticket'
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE t.payment_reference IS NOT NULL
      AND e.status::TEXT NOT IN ('deleted', 'cancelled')
    GROUP BY COALESCE(o.user_id, e.organizer_id), t.event_id::TEXT
  ),
  fee_metrics AS (
    SELECT
      organizer_id,
      event_id,
      COALESCE(SUM(CASE WHEN payment_context = 'vote' THEN platform_fee_amount ELSE 0 END), 0) AS vote_fee,
      COALESCE(SUM(CASE WHEN payment_context = 'ticket' THEN platform_fee_amount ELSE 0 END), 0) AS ticket_fee
    FROM admin_revenue_transactions
    WHERE payment_context IN ('vote', 'ticket')
    GROUP BY organizer_id, event_id
  ),
  withdrawal_metrics AS (
    SELECT
      event_id,
      COALESCE(SUM(CASE WHEN withdrawal_type IN ('vote', 'combined') THEN amount_requested ELSE 0 END), 0) AS vote_wd,
      COALESCE(SUM(CASE WHEN withdrawal_type = 'ticket' THEN amount_requested ELSE 0 END), 0) AS ticket_wd
    FROM organizer_withdrawals
    WHERE status IN ('pending', 'approved', 'processed')
      AND event_id IS NOT NULL
    GROUP BY event_id
  )
  UPDATE organizer_event_earnings oee
  SET
    total_votes = COALESCE(vm.total_votes, 0),
    paid_votes = COALESCE(vm.paid_votes, 0),
    free_votes = COALESCE(vm.free_votes, 0),
    manual_votes = COALESCE(vm.manual_votes, 0),
    paid_ticket_count = COALESCE(tm.paid_ticket_count, 0),
    vote_revenue = COALESCE(vm.vote_revenue, 0),
    ticket_revenue = COALESCE(tm.ticket_revenue, 0),
    total_revenue = COALESCE(vm.vote_revenue, 0) + COALESCE(tm.ticket_revenue, 0),
    vote_platform_fee_deducted = COALESCE(fm.vote_fee, 0),
    ticket_platform_fee_deducted = COALESCE(fm.ticket_fee, 0),
    platform_fee_deducted = COALESCE(fm.vote_fee, 0) + COALESCE(fm.ticket_fee, 0),
    vote_net_earnings = COALESCE(vm.vote_revenue, 0) - COALESCE(fm.vote_fee, 0),
    ticket_net_earnings = COALESCE(tm.ticket_revenue, 0) - COALESCE(fm.ticket_fee, 0),
    net_earnings = (COALESCE(vm.vote_revenue, 0) + COALESCE(tm.ticket_revenue, 0))
                 - (COALESCE(fm.vote_fee, 0) + COALESCE(fm.ticket_fee, 0)),
    withdrawn_vote_revenue = COALESCE(wm.vote_wd, 0),
    withdrawn_ticket_revenue = COALESCE(wm.ticket_wd, 0),
    updated_at = timezone('utc', now())
  FROM active_events ae
  LEFT JOIN vote_metrics vm
    ON vm.organizer_id = ae.organizer_id AND vm.event_id = ae.event_id
  LEFT JOIN ticket_metrics tm
    ON tm.organizer_id = ae.organizer_id AND tm.event_id = ae.event_id
  LEFT JOIN fee_metrics fm
    ON fm.organizer_id = ae.organizer_id AND fm.event_id = ae.event_id
  LEFT JOIN withdrawal_metrics wm
    ON wm.event_id = ae.event_id
  WHERE oee.organizer_id = ae.organizer_id
    AND oee.event_id = ae.event_id;

  -- Roll per-event revenue back up into organizer_wallets.
  UPDATE organizer_wallets ow
  SET
    vote_revenue = COALESCE(subq.vote_revenue, 0),
    ticket_revenue = COALESCE(subq.ticket_revenue, 0),
    total_revenue = COALESCE(subq.vote_revenue, 0) + COALESCE(subq.ticket_revenue, 0),
    total_paid_votes = COALESCE(subq.paid_votes, 0),
    paid_ticket_count = COALESCE(subq.paid_ticket_count, 0),
    manual_votes = COALESCE(subq.manual_votes, 0),
    vote_platform_fees_deducted = COALESCE(subq.vote_fee, 0),
    ticket_platform_fees_deducted = COALESCE(subq.ticket_fee, 0),
    platform_fees_deducted = COALESCE(subq.vote_fee, 0) + COALESCE(subq.ticket_fee, 0),
    net_balance = (COALESCE(subq.vote_revenue, 0) + COALESCE(subq.ticket_revenue, 0))
                - (COALESCE(subq.vote_fee, 0) + COALESCE(subq.ticket_fee, 0)),
    last_updated = timezone('utc', now())
  FROM (
    SELECT
      organizer_id,
      COALESCE(SUM(vote_revenue), 0) AS vote_revenue,
      COALESCE(SUM(ticket_revenue), 0) AS ticket_revenue,
      COALESCE(SUM(paid_votes), 0) AS paid_votes,
      COALESCE(SUM(paid_ticket_count), 0) AS paid_ticket_count,
      COALESCE(SUM(manual_votes), 0) AS manual_votes,
      COALESCE(SUM(vote_platform_fee_deducted), 0) AS vote_fee,
      COALESCE(SUM(ticket_platform_fee_deducted), 0) AS ticket_fee
    FROM organizer_event_earnings
    GROUP BY organizer_id
  ) subq
  WHERE ow.organizer_id = subq.organizer_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Backfill all historical event earnings so existing withdrawals show up
-- -----------------------------------------------------------------------------
SELECT recalculate_revenue_state();
