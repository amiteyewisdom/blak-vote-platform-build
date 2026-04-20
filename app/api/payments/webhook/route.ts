import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminClient, isValidPaystackSignature } from '@/lib/server-security'
import { paymentService } from '@/lib/payment-service'

function getSupabaseClient() {
  // Reuse one admin-client factory to keep credentials consistent across routes.
  return getSupabaseAdminClient()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get("x-paystack-signature")

    // Verify webhook authenticity with a timing-safe signature comparison.
    if (!isValidPaystackSignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(body)

    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true })
    }

    const data = event.data
    const reference = data.reference

    const supabase = getSupabaseClient()
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
      amount: Number(data.amount) / 100,
      status: data.status,
      metadata: data.metadata,
    })

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 })
  }
}
