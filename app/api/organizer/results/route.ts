import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, ensureEventOwnedByOrganizer } from '@/lib/api-auth'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

const querySchema = z.object({
  eventId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['organizer', 'admin'])

    if (!auth.ok) {
      return auth.response
    }

    const parseResult = querySchema.safeParse({
      eventId: request.nextUrl.searchParams.get('eventId'),
    })

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { eventId } = parseResult.data
    const supabase = getSupabaseAdminClient()

    // Verify organizer owns this event
    if (auth.role === 'organizer') {
      const ownershipError = await ensureEventOwnedByOrganizer(supabase, eventId, auth.userId)
      if (ownershipError) {
        return ownershipError
      }
    }

    // Fetch all required data for results page
    const [eventResult, categoriesResult, nominationsResult, votesResult] = await Promise.all([
      supabase
        .from('events')
        .select('id, title')
        .eq('id', eventId)
        .maybeSingle(),
      supabase
        .from('categories')
        .select('id, name')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }),
      supabase
        .from('nominations')
        .select('id, nominee_name, photo_url, vote_count, category_id, status')
        .eq('event_id', eventId)
        .in('status', ['candidate', 'approved']),
      supabase
        .from('votes')
        .select('candidate_id, vote_type, quantity, amount_paid')
        .eq('event_id', eventId),
    ])

    // Check for errors
    if (eventResult.error) {
      console.error('Event fetch error:', eventResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch event', details: eventResult.error.message },
        { status: 500 }
      )
    }

    if (categoriesResult.error) {
      console.error('Categories fetch error:', categoriesResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch categories', details: categoriesResult.error.message },
        { status: 500 }
      )
    }

    if (nominationsResult.error) {
      console.error('Nominations fetch error:', nominationsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch nominations', details: nominationsResult.error.message },
        { status: 500 }
      )
    }

    // For votes, try fallback if first query fails
    let votes = votesResult.data ?? []
    if (votesResult.error) {
      console.error('Votes fetch error (primary):', votesResult.error)
      
      // Try fallback without amount_paid
      const fallbackVotes = await supabase
        .from('votes')
        .select('candidate_id, vote_type, quantity')
        .eq('event_id', eventId)
      
      if (fallbackVotes.error) {
        console.error('Votes fetch error (fallback):', fallbackVotes.error)
        // Still try with just basic columns
        const basicVotes = await supabase
          .from('votes')
          .select('candidate_id, vote_type')
          .eq('event_id', eventId)
        
        if (basicVotes.error) {
          console.error('Votes fetch error (basic):', basicVotes.error)
          votes = []
        } else {
          votes = (basicVotes.data ?? []).map((v: any) => ({
            candidate_id: v.candidate_id,
            vote_type: v.vote_type,
            quantity: 1,
            amount_paid: 0,
          }))
        }
      } else {
        votes = (fallbackVotes.data ?? []).map((v: any) => ({
          candidate_id: v.candidate_id,
          vote_type: v.vote_type,
          quantity: v.quantity || 1,
          amount_paid: 0,
        }))
      }
    }

    return NextResponse.json({
      event: eventResult.data,
      categories: categoriesResult.data ?? [],
      nominations: nominationsResult.data ?? [],
      votes: votes,
    })
  } catch (error: any) {
    console.error('Results API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
