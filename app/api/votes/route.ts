import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

async function detectFraud(
  supabase: any,
  voterId: string | null,
  eventId: string,
  ipAddress: string
) {
  // Prevent duplicate vote (if single-vote policy for logged in users)
  if (voterId) {
    const { data: existing } = await supabase
      .from('votes')
      .select('id')
      .eq('voter_id', voterId)
      .eq('event_id', eventId)

    if (existing && existing.length > 0) {
      return { isFraud: true, reason: 'User already voted in this event' }
    }
  }

  // IP throttling (24-hour window)
  const { data: ipVotes } = await supabase
    .from('votes')
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_ip_address', ipAddress)
    .gte(
      'created_at',
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    )

  if (ipVotes && ipVotes.length > 20) {
    return { isFraud: true, reason: 'Suspicious voting activity detected' }
  }

  return { isFraud: false, reason: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { eventId, candidateId, quantity, phone } = body

    const ipAddress =
      request.headers.get('x-forwarded-for') || 'unknown'

    if (!eventId || !candidateId || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const voteQty = Number(quantity)

    if (isNaN(voteQty) || voteQty <= 0) {
      return NextResponse.json(
        { error: 'Invalid vote quantity' },
        { status: 400 }
      )
    }

    /* ----------------------------------------
       CHECK EVENT STATUS + TIME WINDOW
    ----------------------------------------- */

    const { data: event, error: eventError } = await supabase
      .from('voting_events')
      .select('status, start_date, end_date')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    if (event.status !== 'published') {
      return NextResponse.json(
        { error: 'Voting is not active for this event' },
        { status: 403 }
      )
    }

    const now = new Date()
    const start = new Date(event.start_date)
    const end = new Date(event.end_date)

    if (now < start) {
      return NextResponse.json(
        { error: 'Voting has not started yet' },
        { status: 403 }
      )
    }

    if (now > end) {
      return NextResponse.json(
        { error: 'Voting has ended' },
        { status: 403 }
      )
    }

    /* ----------------------------------------
       VALIDATE CANDIDATE BELONGS TO EVENT
    ----------------------------------------- */

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('id', candidateId)
      .eq('event_id', eventId)
      .single()

    if (!candidate) {
      return NextResponse.json(
        { error: 'Invalid candidate for this event' },
        { status: 400 }
      )
    }

    /* ----------------------------------------
       GET USER (IF LOGGED IN)
    ----------------------------------------- */

    const {
      data: { user }
    } = await supabase.auth.getUser()

    const voterId = user ? user.id : null
    const voterPhone = user ? null : phone || null

    /* ----------------------------------------
       FRAUD CHECK
    ----------------------------------------- */

    const fraud = await detectFraud(
      supabase,
      voterId,
      eventId,
      ipAddress
    )

    if (fraud.isFraud) {
      return NextResponse.json(
        { error: fraud.reason },
        { status: 403 }
      )
    }

    /* ----------------------------------------
       ATOMIC DB VOTE PROCESSING
    ----------------------------------------- */

    const { error: rpcError } = await supabase.rpc('process_vote', {
      p_event_id: eventId,
      p_candidate_id: candidateId,
      p_quantity: voteQty,
      p_voter_id: voterId,
      p_voter_phone: voterPhone,
      p_vote_source: user ? 'online' : 'guest',
      p_payment_method: 'online',
      p_transaction_id: crypto.randomUUID(),
      p_ip_address: ipAddress
    })

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: true },
      { status: 201 }
    )

  } catch (error) {
    console.error('Vote creation error:', error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
