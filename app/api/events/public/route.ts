export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { LIVE_EVENT_STATUSES } from '@/lib/event-status'
import { getSupabaseAdminClient } from '@/lib/server-security'

type PublicCandidate = {
  id: string
  nominee_name?: string | null
  bio?: string | null
  photo_url?: string | null
  short_code?: string | null
  voting_code?: string | null
  vote_count?: number | null
  category_id?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    const rawCode = request.nextUrl.searchParams.get('code')
    const code = rawCode ? rawCode.trim() : null

    if (code) {
      // Query by event_code and short_code separately (avoids .or() + .in() chain issues)
      const [res1, res2, res3] = await Promise.all([
        supabase.from('events').select('*').ilike('event_code', code).maybeSingle(),
        supabase.from('events').select('*').ilike('short_code', code).maybeSingle(),
        supabase.from('events').select('*').eq('id', code).maybeSingle(),
      ])

      const event = res1.data ?? res2.data ?? res3.data

      if (!event) {
        console.error('[PublicAPI] not found code:', code, 'err1:', res1.error?.message, 'err2:', res2.error?.message, 'err3:', res3.error?.message)
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const publicResultsEnabled = await isPublicResultsEnabledForEvent(supabase, event.organizer_id)

      // Direct-link access should resolve regardless of status so shared organizer links always open.

      const [{ data: categoriesData }, candidateResult] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .eq('event_id', event.id)
          .order('created_at', { ascending: true }),
        fetchCandidatesForPublicEvent(supabase, event.id),
      ])

      if (candidateResult.error) {
        console.error('[PublicAPI] candidateError:', candidateResult.error.message)
        return NextResponse.json({ error: 'Failed to fetch candidates', details: candidateResult.error.message }, { status: 500 })
      }

      const candidates = candidateResult.data

      return NextResponse.json({
        event: {
          ...event,
          public_results_enabled: publicResultsEnabled,
        },
        categories: categoriesData ?? [],
        candidates: (candidates ?? []).map((candidate: PublicCandidate) => ({
          id: candidate.id,
          name: candidate.nominee_name,
          nominee_name: candidate.nominee_name,
          bio: candidate.bio,
          photo_url: candidate.photo_url,
          short_code: candidate.short_code,
          voting_code: candidate.short_code || candidate.voting_code,
          vote_count: candidate.vote_count || 0,
          category_id: candidate.category_id || null,
        })),
      })
    }

    // Fetch all events, filter in code to avoid DB-filter edge cases
    const { data: allEvents, error: eventError } = await supabase
      .from('events')
      .select('*')

    if (eventError || !allEvents) {
      console.error('[PublicAPI] Failed to fetch all events:', eventError?.message)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    const filteredEvents = allEvents.filter((event) => {
      const status = String(event.status || '').toLowerCase()
      return status !== 'deleted' && status !== 'cancelled'
    })

    // For each event, fetch nominees sorted by votes desc
    const eventNominees = await Promise.all(filteredEvents.map(async (event) => {
      const [nomineeResult, publicResultsEnabled] = await Promise.all([
        fetchCandidatesForPublicEvent(supabase, event.id),
        isPublicResultsEnabledForEvent(supabase, event.organizer_id),
      ])
      const nominees = nomineeResult.data ?? []
      return {
        event: {
          ...event,
          public_results_enabled: publicResultsEnabled,
        },
        nominees: (nominees ?? []).map((nominee: PublicCandidate) => ({
          id: nominee.id,
          name: nominee.nominee_name,
          bio: nominee.bio,
          photo_url: nominee.photo_url,
          short_code: nominee.short_code,
          voting_code: nominee.short_code || nominee.voting_code,
          vote_count: nominee.vote_count,
        })),
      };
    }));

    return NextResponse.json({ eventNominees });

  } catch (err: any) {
    console.error('[PublicAPI] Unhandled error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function fetchCandidatesForPublicEvent(supabase: any, eventId: string) {
  const publicNominationStatuses = ['candidate', 'approved']

  const withCategory = await supabase
    .from('nominations')
    .select('id, nominee_name, bio, photo_url, voting_code, short_code, vote_count, category_id, status')
    .eq('event_id', eventId)
    .in('status', publicNominationStatuses)
    .order('vote_count', { ascending: false })

  if (!withCategory.error) {
    return { data: withCategory.data ?? [], error: null }
  }

  const withoutCategory = await supabase
    .from('nominations')
    .select('id, nominee_name, bio, photo_url, voting_code, short_code, vote_count, status')
    .eq('event_id', eventId)
    .in('status', publicNominationStatuses)
    .order('vote_count', { ascending: false })

  if (!withoutCategory.error) {
    const normalized = (withoutCategory.data ?? []).map((row: any) => ({ ...row, category_id: null }))
    return { data: normalized, error: null }
  }

  const minimal = await supabase
    .from('nominations')
    .select('id, nominee_name, vote_count, status')
    .eq('event_id', eventId)
    .in('status', publicNominationStatuses)
    .order('vote_count', { ascending: false })

  if (!minimal.error) {
    const normalized = (minimal.data ?? []).map((row: any) => ({
      ...row,
      bio: null,
      photo_url: null,
      voting_code: null,
      short_code: null,
      category_id: null,
    }))
    return { data: normalized, error: null }
  }

  return { data: [], error: minimal.error || withoutCategory.error || withCategory.error }
}

async function isPublicResultsEnabledForEvent(supabase: any, organizerRef: string | null | undefined) {
  if (!organizerRef) {
    return true
  }

  const ref = String(organizerRef)

  const directSettings = await supabase
    .from('organizer_settings')
    .select('enable_public_results')
    .eq('organizer_user_id', ref)
    .maybeSingle()

  if (!directSettings.error && directSettings.data) {
    return directSettings.data.enable_public_results !== false
  }

  const organizerLink = await supabase
    .from('organizers')
    .select('user_id')
    .eq('id', ref)
    .maybeSingle()

  const mappedUserId = organizerLink.data?.user_id ? String(organizerLink.data.user_id) : null
  if (mappedUserId) {
    const mappedSettings = await supabase
      .from('organizer_settings')
      .select('enable_public_results')
      .eq('organizer_user_id', mappedUserId)
      .maybeSingle()

    if (!mappedSettings.error && mappedSettings.data) {
      return mappedSettings.data.enable_public_results !== false
    }
  }

  const candidateUserIds = mappedUserId ? [ref, mappedUserId] : [ref]
  for (const userId of candidateUserIds) {
    const authUserRes = await supabase.auth.admin.getUserById(userId)
    const metadata = authUserRes.data?.user?.user_metadata?.organizer_settings
    if (typeof metadata?.enable_public_results === 'boolean') {
      return metadata.enable_public_results
    }
  }

  // Keep legacy behavior for organizers that never configured settings.
  return true
}