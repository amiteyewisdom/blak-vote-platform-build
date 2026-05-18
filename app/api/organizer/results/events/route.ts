import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { resolveOrganizerRefs } from '@/lib/organizer-wallet'

type VoteRow = {
  event_id: string
  candidate_id: string | null
  quantity: number | null
}

type NominationRow = {
  id: string
  event_id: string
  nominee_name: string | null
  status: string | null
}

export async function GET() {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['organizer'])

    if (!auth.ok) {
      return auth.response
    }

    const supabase = getSupabaseAdminClient()
    const organizerRefs = await resolveOrganizerRefs(supabase, auth.userId)

    if (!organizerRefs.aliases.length) {
      return NextResponse.json({ events: [] })
    }

    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, title, status')
      .in('organizer_id', organizerRefs.aliases)
      .order('created_at', { ascending: false })

    if (eventsError) {
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      )
    }

    const eventIds = (eventsData ?? []).map((event) => String(event.id))
    if (!eventIds.length) {
      return NextResponse.json({ events: [] })
    }

    const [{ data: nominationsData, error: nominationsError }, { data: votesData, error: votesError }] = await Promise.all([
      supabase
        .from('nominations')
        .select('id, event_id, nominee_name, status')
        .in('event_id', eventIds),
      supabase
        .from('votes')
        .select('event_id, candidate_id, quantity')
        .in('event_id', eventIds),
    ])

    if (nominationsError) {
      return NextResponse.json(
        { error: 'Failed to fetch nominations', details: nominationsError.message },
        { status: 500 }
      )
    }

    if (votesError) {
      return NextResponse.json(
        { error: 'Failed to fetch votes', details: votesError.message },
        { status: 500 }
      )
    }

    const votesByCandidateId = new Map<string, number>()

    for (const vote of (votesData ?? []) as VoteRow[]) {
      if (!vote.candidate_id) continue
      const key = String(vote.candidate_id)
      const qty = Number(vote.quantity ?? 1)
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1
      votesByCandidateId.set(key, (votesByCandidateId.get(key) ?? 0) + safeQty)
    }

    const nominationsByEventId = new Map<string, NominationRow[]>()

    for (const nomination of (nominationsData ?? []) as NominationRow[]) {
      const status = String(nomination.status ?? '').toLowerCase()
      if (status && !['candidate', 'approved'].includes(status)) {
        continue
      }

      const eventId = String(nomination.event_id)
      const list = nominationsByEventId.get(eventId) ?? []
      list.push(nomination)
      nominationsByEventId.set(eventId, list)
    }

    const events = (eventsData ?? []).map((event) => {
      const eventId = String(event.id)
      const nominees = nominationsByEventId.get(eventId) ?? []

      const totalVotes = nominees.reduce((sum, nominee) => {
        return sum + (votesByCandidateId.get(String(nominee.id)) ?? 0)
      }, 0)

      const results = nominees.map((nominee) => {
        const voteCount = votesByCandidateId.get(String(nominee.id)) ?? 0
        const percentage = totalVotes > 0 ? Number(((voteCount / totalVotes) * 100).toFixed(1)) : 0
        return {
          candidateName: nominee.nominee_name || 'Unnamed nominee',
          voteCount,
          percentage,
        }
      })

      return {
        id: eventId,
        title: event.title,
        status: event.status,
        totalVotes,
        results,
      }
    })

    return NextResponse.json({ events })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}