import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET() {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data, error } = await adminSupabase
    .from('organizer_fee_overrides')
    .select('organizer_user_id, platform_fee_percent, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ overrides: data || [] })
}

export async function POST(req: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const body = await req.json().catch(() => ({}))
  const organizerUserId = String(body.organizerUserId || '')
  const rawPercent = body.platformFeePercent

  if (!organizerUserId) {
    return NextResponse.json({ error: 'Missing organizerUserId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  if (rawPercent === null || rawPercent === undefined || rawPercent === '') {
    const { error: deleteError } = await adminSupabase
      .from('organizer_fee_overrides')
      .delete()
      .eq('organizer_user_id', organizerUserId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, organizerUserId, platformFeePercent: null })
  }

  const platformFeePercent = Number(rawPercent)
  if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 100) {
    return NextResponse.json({ error: 'platformFeePercent must be between 0 and 100' }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from('organizer_fee_overrides')
    .upsert(
      {
        organizer_user_id: organizerUserId,
        platform_fee_percent: Number(platformFeePercent.toFixed(2)),
        updated_by_user_id: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organizer_user_id' }
    )
    .select('organizer_user_id, platform_fee_percent, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, override: data })
}
