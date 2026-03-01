import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const { userId, eventId, votingFee } = body

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        event_id: eventId,
        amount: votingFee,
        status: 'pending',
        payment_method: 'stripe',
      })
      .select()

    if (paymentError) {
      return NextResponse.json(
        { error: 'Failed to create payment record' },
        { status: 500 }
      )
    }

    // In a real implementation, you would integrate with Stripe here
    // For now, we'll return a mock checkout session
    const checkoutSession = {
      id: 'cs_' + Math.random().toString(36).substr(2, 9),
      payment_id: payment[0].id,
      amount: votingFee,
      currency: 'usd',
      status: 'pending',
    }

    return NextResponse.json({ checkoutSession }, { status: 201 })
  } catch (error) {
    console.error('Payment creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
