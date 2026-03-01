import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventId, candidateId, quantity, phone } = body

    if (!eventId || !candidateId || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 1️⃣ Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, vote_price, status')
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

    // 2️⃣ Get candidate
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('id', candidateId)
      .eq('event_id', eventId)
      .single()

    if (candidateError || !candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      )
    }

    // 3️⃣ Calculate total amount server-side
    const totalAmount = event.vote_price * quantity

    const reference = crypto.randomUUID()

    // 4️⃣ Initialize Paystack
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: `${phone}@blakvote.local`, // temporary email for guests
        amount: totalAmount * 100, // convert to kobo
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/success`,
        metadata: {
          eventId,
          candidateId,
          quantity,
          phone,
          vote_price: event.vote_price
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return NextResponse.json(paystackResponse.data.data)

  } catch (error: any) {
    console.error(
      'Paystack initialize error:',
      error.response?.data || error.message
    )

    return NextResponse.json(
      { error: 'Payment initialization failed' },
      { status: 500 }
    )
  }
}
