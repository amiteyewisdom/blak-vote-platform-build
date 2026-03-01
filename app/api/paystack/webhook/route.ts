import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: Request) {
  console.log('Webhook HIT')
  
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-paystack-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Verify Paystack signature
    const hash = crypto
      .createHmac(
        'sha512',
        process.env.PAYSTACK_SECRET_KEY!
      )
      .update(rawBody)
      .digest('hex')

    if (hash !== signature) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    const payload = JSON.parse(rawBody)

    // Only process successful payments
    if (payload.event !== 'charge.success') {
      return NextResponse.json({ received: true })
    }

    const { reference, amount, status, metadata } = payload.data

    // Ensure proper typing
    const nomineeId = metadata?.nomineeId
    const eventId = metadata?.eventId
    const votes = Number(metadata?.votes)

    if (!nomineeId || !eventId || !votes) {
      return NextResponse.json(
        { error: 'Invalid metadata' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Prevent duplicate webhook processing
    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('payment_reference', reference)
      .maybeSingle()

    if (existingVote) {
      return NextResponse.json({ received: true })
    }

    // Insert vote record
    const { error: insertError } = await supabase
      .from('votes')
      .insert({
        event_id: eventId,
        nominee_id: nomineeId,
        votes_count: votes,
        amount_paid: amount / 100,
        payment_reference: reference,
        payment_status: status,
      })

    if (insertError) {
      console.error('Vote insert error:', insertError)
      return NextResponse.json(
        { error: 'Database error (insert)' },
        { status: 500 }
      )
    }

    // Fetch nominee current totals
    const { data: nominee, error: nomineeFetchError } = await supabase
      .from('nominees')
      .select('vote_count, revenue')
      .eq('id', nomineeId)
      .single()

    if (nomineeFetchError || !nominee) {
      console.error('Nominee fetch error:', nomineeFetchError)
      return NextResponse.json(
        { error: 'Nominee not found' },
        { status: 500 }
      )
    }

    // Update nominee totals
    const { error: nomineeUpdateError } = await supabase
      .from('nominees')
      .update({
        vote_count: nominee.vote_count + votes,
        revenue: nominee.revenue + amount / 100,
      })
      .eq('id', nomineeId)

    if (nomineeUpdateError) {
      console.error('Nominee update error:', nomineeUpdateError)
    }

    // Fetch event current totals
    const { data: eventData } = await supabase
      .from('events')
      .select('total_votes, total_revenue')
      .eq('id', eventId)
      .single()

    if (eventData) {
      await supabase
        .from('events')
        .update({
          total_votes: eventData.total_votes + votes,
          total_revenue: eventData.total_revenue + amount / 100,
        })
        .eq('id', eventId)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)

    return NextResponse.json(
      { error: 'Webhook failed' },
      { status: 500 }
    )
  }
}