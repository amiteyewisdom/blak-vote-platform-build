import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const body = await req.json().catch(() => ({}))
  const withdrawalId = body.withdrawalId
  const payoutRef = typeof body.payoutRef === 'string' ? body.payoutRef.trim() : null
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : ''

  if (!withdrawalId) {
    return NextResponse.json({ error: 'Missing withdrawalId' }, { status: 400 })
  }

  const { data: withdrawal, error: withdrawalError } = await supabase
    .from('organizer_withdrawals')
    .select('id, status, processed_at, admin_note')
    .eq('id', withdrawalId)
    .single()

  if (withdrawalError || !withdrawal) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
  }

  if (withdrawal.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved withdrawals can be marked processed' }, { status: 400 })
  }

  if (withdrawal.processed_at) {
    return NextResponse.json({ error: 'Withdrawal already processed' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  // Use atomic RPC so pending_balance is released in the same transaction.
  const { error: rpcError } = await adminSupabase.rpc('mark_organizer_withdrawal_processed', {
    p_withdrawal_id: Number(withdrawalId),
    p_payout_ref:    payoutRef || null,
  })

  if (rpcError) {
    const msg = String(rpcError.message || '').toLowerCase()
    const isMissing = msg.includes('function') || msg.includes('does not exist')

    if (!isMissing) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 })
    }

    // Migration not deployed — fall back to direct update.
    const { error: updateError } = await supabase
      .from('organizer_withdrawals')
      .update({
        status:       'processed',
        processed_at: new Date().toISOString(),
        admin_note:   adminNote || withdrawal.admin_note || null,
      })
      .eq('id', withdrawalId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true })
}