import { NextRequest, NextResponse } from 'next/server'
import {
  cleanupStalePayments,
  cleanupGhostPayments,
  cleanupStuckVerifyingPayments,
  getPaymentStats,
} from '@/lib/payment-processing'

function isAuthorizedCronRequest(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return false
  }

  const bearer = request.headers.get('authorization')
  const token = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : null
  const fallback = request.headers.get('x-cron-secret')

  return token === configuredSecret || fallback === configuredSecret
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'full'

    const before = await getPaymentStats()
    if (!before.ok) {
      return NextResponse.json({ error: before.error }, { status: 500 })
    }

    const results: Record<string, unknown> = {
      action,
      before: before.stats,
    }

    if (action === 'full' || action === 'stale') {
      const staleResult = await cleanupStalePayments(30)
      results.stale = staleResult
    }

    if (action === 'full' || action === 'verifying') {
      const verifyingResult = await cleanupStuckVerifyingPayments(20)
      results.verifying = verifyingResult
    }

    if (action === 'full' || action === 'ghost') {
      const ghostResult = await cleanupGhostPayments(60)
      results.ghost = ghostResult
    }

    const after = await getPaymentStats()
    results.after = after.ok ? after.stats : { error: after.error }

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        ...results,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Cron payment cleanup failed:', error)
    return NextResponse.json({ error: 'Cleanup execution failed' }, { status: 500 })
  }
}
