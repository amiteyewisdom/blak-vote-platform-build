import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import {
  cleanupStalePayments,
  cleanupGhostPayments,
  cleanupStuckVerifyingPayments,
  getPaymentStats,
} from '@/lib/payment-processing'

/**
 * POST /api/admin/payments/cleanup
 *
 * Admin-only endpoint to trigger payment cleanup tasks:
 * - Mark stale pending payments (> 30 min) as failed
 * - Mark stuck verifying payments as failed
 * - Archive/delete ghost payments with no linked votes
 * - Return payment statistics
 *
 * Requires: admin role
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify admin role
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const { action = 'full' } = body

    const results: any = {}

    // Step 1: Get current stats
    const statsResult = await getPaymentStats()
    if (!statsResult.ok) {
      return NextResponse.json({ error: statsResult.error }, { status: 500 })
    }
    results.before = statsResult.stats

    // Step 2: Cleanup stale payments (pending for >30 mins)
    if (action === 'full' || action === 'stale') {
      const staleResult = await cleanupStalePayments(30)
      if (staleResult.ok) {
        results.staleMarked = staleResult.markedCount
      } else {
        console.warn('Stale payment cleanup failed:', staleResult.error)
      }
    }

    // Step 3: Cleanup stuck verifying payments (>20 mins)
    if (action === 'full' || action === 'verifying') {
      const stuckResult = await cleanupStuckVerifyingPayments(20)
      if (stuckResult.ok) {
        results.verifyingMarked = stuckResult.markedCount
      } else {
        console.warn('Stuck verifying cleanup failed:', stuckResult.error)
      }
    }

    // Step 4: Cleanup ghost payments (success/pending with no vote after 60 mins)
    if (action === 'full' || action === 'ghost') {
      const ghostResult = await cleanupGhostPayments(60)
      if (ghostResult.ok) {
        results.ghostArchived = ghostResult.archived
        results.ghostDeleted = ghostResult.deleted
      } else {
        console.warn('Ghost payment cleanup failed:', ghostResult.error)
      }
    }

    // Step 5: Get updated stats
    const updatedStatsResult = await getPaymentStats()
    if (updatedStatsResult.ok) {
      results.after = updatedStatsResult.stats
    }

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        ...results,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Payment cleanup endpoint error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

/**
 * GET /api/admin/payments/cleanup
 *
 * Get payment statistics without triggering cleanup
 * Useful for monitoring and dashboards
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const statsResult = await getPaymentStats()

    if (!statsResult.ok) {
      return NextResponse.json({ error: statsResult.error }, { status: 500 })
    }

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        stats: statsResult.stats,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Payment stats endpoint error:', error)
    return NextResponse.json({ error: 'Stats query failed' }, { status: 500 })
  }
}
