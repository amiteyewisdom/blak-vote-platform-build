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

  // Always return the default (10%) for organizers not in the overrides list
  // If you want to fetch for a specific organizer, pass ?organizerUserId=...
  // Otherwise, return all overrides and note the default
  const searchParams = new URLSearchParams(globalThis.location?.search || '')
  const organizerUserId = searchParams.get('organizerUserId')
  if (organizerUserId) {
    const found = (data || []).find((row) => row.organizer_user_id === organizerUserId)
    return NextResponse.json({
      organizerUserId,
      platformFeePercent: found ? found.platform_fee_percent : 10,
      override: found || null,
      default: !found
    })
  }
  return NextResponse.json({ overrides: data || [], defaultPlatformFeePercent: 10 })
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
  let resolvedOrganizerUserId = null
  let userRow = null
  let organizerRow = null

  // Try direct user ID
  const { data: user } = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', organizerUserId)
    .maybeSingle()
  if (user?.id) {
    resolvedOrganizerUserId = user.id
    userRow = user
  } else {
    // Try organizer ID -> user_id
    const { data: organizer } = await adminSupabase
      .from('organizers')
      .select('user_id')
      .eq('id', organizerUserId)
      .maybeSingle()
    if (organizer?.user_id) {
      // Double check that user_id exists in users
      const { data: user2 } = await adminSupabase
        .from('users')
        .select('id')
        .eq('id', organizer.user_id)
        .maybeSingle()
      if (user2?.id) {
        resolvedOrganizerUserId = user2.id
        userRow = user2
        organizerRow = organizer
      }
    }
  }

  if (!resolvedOrganizerUserId) {
    console.error('[organizer-fees] Invalid organizerUserId:', organizerUserId, 'Resolved:', resolvedOrganizerUserId, 'userRow:', userRow, 'organizerRow:', organizerRow)
    return NextResponse.json({
      error: 'Invalid organizer user id (must be a valid user in auth.users)',
      received: organizerUserId,
      resolved: resolvedOrganizerUserId,
      userRow,
      organizerRow
    }, { status: 400 })
  }

  if (rawPercent === null || rawPercent === undefined || rawPercent === '') {
    const { error: deleteError } = await adminSupabase
      .from('organizer_fee_overrides')
      .delete()
      .eq('organizer_user_id', resolvedOrganizerUserId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // No override, so default applies
    return NextResponse.json({ success: true, organizerUserId: resolvedOrganizerUserId, platformFeePercent: 10, default: true })
  }

  const platformFeePercent = Number(rawPercent)
  if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 100) {
    return NextResponse.json({ error: 'platformFeePercent must be between 0 and 100' }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from('organizer_fee_overrides')
    .upsert(
      {
        organizer_user_id: resolvedOrganizerUserId,
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
