import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
    const supabase = getSupabaseClient()
    const body = await request.json()
    const {
      title,
      description,
      organizerId,
      startDate,
      endDate,
      votingFee,
      maxVoters,
      candidates,
    } = body

    // Create event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        title,
        description,
        organizer_id: organizerId,
        start_date: startDate,
        end_date: endDate,
        voting_fee: votingFee,
        max_voters: maxVoters,
        status: 'draft',
        is_active: false,
      })
      .select()

    if (eventError) {
      return NextResponse.json(
        { error: 'Failed to create event' },
        { status: 500 }
      )
    }

    // Create candidates
    const candidatesToInsert = candidates.map((candidate: any) => ({
      event_id: event[0].id,
      name: candidate.name,
      description: candidate.description || null,
      image_url: candidate.imageUrl || null,
    }))

    const { data: createdCandidates, error: candidatesError } = await supabase
      .from('candidates')
      .insert(candidatesToInsert)
      .select()

    if (candidatesError) {
      return NextResponse.json(
        { error: 'Failed to create candidates' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        event: event[0],
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
