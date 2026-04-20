import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const withdrawalId = Number(body.withdrawalId)
    const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : ''

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return NextResponse.json({ error: 'Valid withdrawalId is required' }, { status: 400 })
    }

    const { data: withdrawal, error: lookupError } = await adminSupabase
      .from('admin_platform_withdrawals')
      .select('id, status')
      .eq('id', withdrawalId)
      .single()

    if (lookupError || !withdrawal) {
      return NextResponse.json({ error: 'Platform withdrawal not found' }, { status: 404 })
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending withdrawals can be processed' }, { status: 400 })
    }

    const { error: updateError } = await adminSupabase
      .from('admin_platform_withdrawals')
      .update({
        status: 'processed',
        admin_note: adminNote || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin platform withdrawal process error:', error)
    return NextResponse.json({ error: 'Failed to process platform withdrawal' }, { status: 500 })
  }
}