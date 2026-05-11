import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { attemptPaystackOrganizerWithdrawalPayout, type OrganizerWithdrawalPayoutRow } from '@/lib/paystack-payouts'

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
    const limit = Math.min(Math.max(Number(body.limit || 20), 1), 100)
    const adminSupabase = getSupabaseAdminClient()

    const { data: withdrawals, error } = await adminSupabase
      .from('organizer_withdrawals')
      .select('*')
      .in('status', ['approved', 'pending_funds'])
      .is('processed_at', null)
      .order('approved_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results: Array<{ id: number; status: string; message: string }> = []

    for (const withdrawal of (withdrawals || []) as OrganizerWithdrawalPayoutRow[]) {
      const result = await attemptPaystackOrganizerWithdrawalPayout({
        supabase: adminSupabase,
        withdrawal,
        trigger: 'cron',
      })

      results.push({
        id: withdrawal.id,
        status: result.status,
        message: result.message,
      })
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Organizer payout cron failed:', error)
    return NextResponse.json({ error: 'Organizer payout cron failed' }, { status: 500 })
  }
}