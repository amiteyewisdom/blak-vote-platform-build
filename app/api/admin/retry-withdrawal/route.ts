import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { attemptPaystackOrganizerWithdrawalPayout } from '@/lib/paystack-payouts'

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const body = await req.json().catch(() => ({}))
  const withdrawalId = body.withdrawalId

  if (!withdrawalId) {
    return NextResponse.json({ error: 'Missing withdrawalId' }, { status: 400 })
  }

  const { data: withdrawal, error: withdrawalError } = await supabase
    .from('organizer_withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single()

  if (withdrawalError || !withdrawal) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
  }

  if (withdrawal.processed_at || !['approved', 'pending_funds'].includes(withdrawal.status)) {
    return NextResponse.json({ error: 'Only approved or pending funds withdrawals can be retried' }, { status: 400 })
  }

  try {
    const payout = await attemptPaystackOrganizerWithdrawalPayout({
      supabase,
      withdrawal,
      trigger: 'cron',
    })

    return NextResponse.json({ success: true, payoutStatus: payout.status, message: payout.message })
  } catch (error) {
    console.error('Organizer payout retry failed:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to retry organizer payout',
    }, { status: 500 })
  }
}