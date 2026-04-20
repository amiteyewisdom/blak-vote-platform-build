import { NextResponse } from 'next/server'
import { getSupabaseAdminClient, isValidPaystackSignature } from '@/lib/server-security'
import { paymentService } from '@/lib/payment-service'

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

    // Verify webhook authenticity with a timing-safe signature comparison.
    if (!isValidPaystackSignature(rawBody, signature)) {
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

    const { reference, amount, metadata, status } = payload.data

    // Reuse one admin-client factory to keep credentials consistent across routes.
    const supabase = getSupabaseAdminClient()

    // Prevent duplicate webhook processing
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('vote_id, ticket_id')
      .eq('reference', reference)
      .maybeSingle()

    if (existingPayment?.vote_id || existingPayment?.ticket_id) {
      return NextResponse.json({ received: true })
    }

    const result = await paymentService.handleSuccess({
      provider: 'paystack',
      paymentMethod: 'paystack',
      reference,
      amount: Number(amount) / 100,
      status,
      metadata,
    })

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
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