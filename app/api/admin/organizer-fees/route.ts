import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getGlobalFeeDefaults } from '@/lib/organizer-fees'
import { getSupabaseAdminClient } from '@/lib/server-security'

function parseFeePercent(raw: unknown) {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return undefined
  }

  return Number(parsed.toFixed(2))
}

async function resolveOrganizerUserId(adminSupabase: ReturnType<typeof getSupabaseAdminClient>, organizerUserId: string) {
  const { data: user } = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', organizerUserId)
    .maybeSingle()

  if (user?.id) {
    return user.id
  }

  const { data: organizer } = await adminSupabase
    .from('organizers')
    .select('user_id')
    .eq('id', organizerUserId)
    .maybeSingle()

  if (!organizer?.user_id) {
    return null
  }

  const { data: user2 } = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', organizer.user_id)
    .maybeSingle()

  return user2?.id ?? null
}

export async function GET(req: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const adminSupabase = getSupabaseAdminClient()
  const defaults = await getGlobalFeeDefaults()

  const { data, error } = await adminSupabase
    .from('organizer_fee_overrides')
    .select('organizer_user_id, platform_fee_percent, ticketing_fee_percent, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const searchParams = new URL(req.url).searchParams
  const organizerUserId = searchParams.get('organizerUserId')

  if (organizerUserId) {
    const found = (data || []).find((row) => row.organizer_user_id === organizerUserId)
    return NextResponse.json({
      organizerUserId,
      platformFeePercent: found?.platform_fee_percent ?? defaults.voteDefault,
      ticketingFeePercent: found?.ticketing_fee_percent ?? defaults.ticketingDefault,
      override: found || null,
      defaultVoteFee: defaults.voteDefault,
      defaultTicketingFee: defaults.ticketingDefault,
    })
  }

  return NextResponse.json({
    overrides: data || [],
    defaultPlatformFeePercent: defaults.voteDefault,
    defaultTicketingFeePercent: defaults.ticketingDefault,
  })
}

export async function POST(req: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const body = await req.json().catch(() => ({}))
  const organizerUserId = String(body.organizerUserId || '')
  const votePercent = parseFeePercent(body.platformFeePercent)
  const ticketingPercent = parseFeePercent(body.ticketingFeePercent)

  if (!organizerUserId) {
    return NextResponse.json({ error: 'Missing organizerUserId' }, { status: 400 })
  }

  if (votePercent === undefined || ticketingPercent === undefined) {
    return NextResponse.json({ error: 'Fee percentages must be between 0 and 100' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()
  const resolvedOrganizerUserId = await resolveOrganizerUserId(adminSupabase, organizerUserId)

  if (!resolvedOrganizerUserId) {
    return NextResponse.json({ error: 'Invalid organizer user id' }, { status: 400 })
  }

  const defaults = await getGlobalFeeDefaults()

  if (votePercent === null && ticketingPercent === null) {
    const { error: deleteError } = await adminSupabase
      .from('organizer_fee_overrides')
      .delete()
      .eq('organizer_user_id', resolvedOrganizerUserId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      organizerUserId: resolvedOrganizerUserId,
      platformFeePercent: defaults.voteDefault,
      ticketingFeePercent: defaults.ticketingDefault,
      default: true,
    })
  }

  const { data: existing } = await adminSupabase
    .from('organizer_fee_overrides')
    .select('platform_fee_percent, ticketing_fee_percent')
    .eq('organizer_user_id', resolvedOrganizerUserId)
    .maybeSingle()

  const nextVotePercent = votePercent === null ? existing?.platform_fee_percent ?? null : votePercent
  const nextTicketingPercent =
    ticketingPercent === null ? existing?.ticketing_fee_percent ?? null : ticketingPercent

  if (nextVotePercent == null && nextTicketingPercent == null) {
    const { error: deleteError } = await adminSupabase
      .from('organizer_fee_overrides')
      .delete()
      .eq('organizer_user_id', resolvedOrganizerUserId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      organizerUserId: resolvedOrganizerUserId,
      platformFeePercent: defaults.voteDefault,
      ticketingFeePercent: defaults.ticketingDefault,
      default: true,
    })
  }

  const { data, error } = await adminSupabase
    .from('organizer_fee_overrides')
    .upsert(
      {
        organizer_user_id: resolvedOrganizerUserId,
        platform_fee_percent: nextVotePercent,
        ticketing_fee_percent: nextTicketingPercent,
        updated_by_user_id: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organizer_user_id' }
    )
    .select('organizer_user_id, platform_fee_percent, ticketing_fee_percent, updated_at')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23503') {
      return NextResponse.json(
        {
          error: 'Database foreign-key mismatch for organizer fee overrides. Apply latest migrations.',
          details: error.message,
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, override: data })
}
