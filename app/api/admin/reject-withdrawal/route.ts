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
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : ''

  if (!withdrawalId) {
    return NextResponse.json({ error: 'Missing withdrawalId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  // Use atomic RPC: marks withdrawal as rejected AND restores withdrawable_balance
  // in the same database transaction — prevents any window where the balance is
  // neither available nor in-flight.
  const { error: rpcError } = await adminSupabase.rpc('reverse_organizer_withdrawal', {
    p_withdrawal_id: Number(withdrawalId),
    p_reason:        adminNote || null,
  })

  if (!rpcError) {
    return NextResponse.json({ success: true })
  }

  const msg = String(rpcError.message || '').toLowerCase()
  const isMissing = msg.includes('function') || msg.includes('does not exist')

  if (!isMissing) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 })
  }

  // Migration not deployed — fall back to direct status update only.
  // NOTE: without the migration the organizer's withdrawable_balance will NOT
  //       be restored; run sync_organizer_wallet_from_ledger() to reconcile.
  const { data: withdrawal, error: fetchError } = await supabase
    .from('organizer_withdrawals')
    .select('id, status')
    .eq('id', withdrawalId)
    .single()

  if (fetchError || !withdrawal) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
  }

  if (!['pending', 'approved'].includes(withdrawal.status)) {
    return NextResponse.json(
      { error: `Cannot reject withdrawal with status "${withdrawal.status}"` },
      { status: 400 },
    )
  }

  const { error: updateError } = await supabase
    .from('organizer_withdrawals')
    .update({
      status:     'rejected',
      admin_note: adminNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
