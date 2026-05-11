import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

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

  const { error: updateError } = await supabase
    .from('organizer_withdrawals')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      admin_note: adminNote || withdrawal.admin_note || null,
    })
    .eq('id', withdrawalId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}