import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

// Function to create Supabase client (lazy initialization)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createServerClient()

    const auth = await requireRole(sessionClient, ['admin', 'organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const supabase = getSupabaseClient()
    const body = await request.json()
    const {
      title,
      description,
      organizerId,
      startDate,
      endDate,
      imageUrl,
      votingType,
      costPerVote,
      votePrice,
      votingFee,
      maxVoters,
      candidates,
    } = body

    const effectiveOrganizerId = auth.role === 'admin' ? organizerId : auth.userId

    if (!effectiveOrganizerId) {
      return NextResponse.json(
        { error: 'Missing organizerId' },
        { status: 400 }
      )
    }

    if (!title || !description || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (auth.role === 'organizer') {
      const [{ data: platformSettings, error: settingsError }, { count: eventCount, error: countError }] = await Promise.all([
        supabase
          .from('platform_settings')
          .select('max_events_per_organizer')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('organizer_id', auth.userId)
          .neq('status', 'deleted')
          .neq('status', 'cancelled'),
      ])

      const maxEventsPerOrganizer =
        !settingsError && platformSettings?.max_events_per_organizer != null
          ? Number(platformSettings.max_events_per_organizer)
          : 10

      if (!countError && typeof eventCount === 'number' && eventCount >= maxEventsPerOrganizer) {
        return NextResponse.json(
          {
            error: `Event limit reached. Maximum allowed is ${maxEventsPerOrganizer}.`,
          },
          { status: 403 }
        )
      }
    }

    const resolvedVotePrice = Number(
      votePrice ?? costPerVote ?? votingFee ?? 0
    )

    const buildEventPayload = (organizerIdToUse: string, reduced = false) => {
      const base = {
        title,
        description,
        organizer_id: organizerIdToUse,
        start_date: startDate,
        end_date: endDate,
      } as Record<string, any>

      if (!reduced) {
        base.image_url = imageUrl ?? null
        base.voting_type = votingType ?? 'paid'
        base.vote_price = resolvedVotePrice
        base.cost_per_vote = resolvedVotePrice
        base.max_voters = maxVoters
      }

      return base
    }

    const tryCreateEvent = async (organizerIdToUse: string, reduced = false) => {
      return supabase
        .from('events')
        .insert(buildEventPayload(organizerIdToUse, reduced))
        .select()
        .maybeSingle()
    }

    let eventData: any = null
    let eventError: any = null

    // 1) Try with auth user id and full payload
    const firstInsert = await tryCreateEvent(effectiveOrganizerId)
    eventData = firstInsert.data
    eventError = firstInsert.error

    // 2) Retry with reduced payload if schema differs (missing optional columns)
    if (eventError && !eventData) {
      const reducedInsert = await tryCreateEvent(effectiveOrganizerId, true)
      eventData = reducedInsert.data
      eventError = reducedInsert.error
    }

    // 3) If organizer FK points to organizers.id, map user -> organizer record and retry
    if (eventError && !eventData) {
      const organizerLookup = await supabase
        .from('organizers')
        .select('id')
        .eq('user_id', effectiveOrganizerId)
        .maybeSingle()

      if (!organizerLookup.error && organizerLookup.data?.id) {
        const orgInsert = await tryCreateEvent(organizerLookup.data.id)
        eventData = orgInsert.data
        eventError = orgInsert.error

        if (eventError && !eventData) {
          const orgReducedInsert = await tryCreateEvent(organizerLookup.data.id, true)
          eventData = orgReducedInsert.data
          eventError = orgReducedInsert.error
        }
      }
    }

    if (!eventData) {
      return NextResponse.json(
        { error: eventError?.message || 'Failed to create event' },
        { status: 500 }
      )
    }

    // Create candidates
    const candidateList = Array.isArray(candidates) ? candidates : []

    const candidatesToInsert = candidateList.map((candidate: any) => ({
      event_id: eventData.id,
      nominee_name: candidate.name,
      bio: candidate.description || null,
      photo_url: candidate.imageUrl || null,
      status: 'candidate',
      nominated_by_user_id: null, // Organizer created
    }))

    let createdCandidates: any[] = []

    if (candidatesToInsert.length > 0) {
      const { data, error: candidatesError } = await supabase
        .from('nominations')
        .insert(candidatesToInsert)
        .select()

      if (candidatesError) {
        return NextResponse.json(
          { error: 'Failed to create candidates' },
          { status: 500 }
        )
      }

      createdCandidates = data ?? []
    }

    return NextResponse.json(
      {
        event: eventData,
        candidates: createdCandidates,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Event creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const searchParams = request.nextUrl.searchParams
    const organizerId = searchParams.get('organizerId')
    const isActive = searchParams.get('isActive')

    let query = supabase.from('events').select(`
      *,
      candidates(id, name, description, image_url),
      votes(id)
    `)

    if (organizerId) {
      query = query.eq('organizer_id', organizerId)
    }

    if (isActive) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data: events, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      )
    }

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Events fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
