import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get("x-paystack-signature")

    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
      .update(body)
      .digest("hex")

    if (hash !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(body)

    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true })
    }

    const data = event.data
    const metadata = data.metadata
    const reference = data.reference

    const supabase = getSupabaseClient()

    // Prevent duplicate processing
    const { data: existing } = await supabase
      .from("votes")
      .select("id")
      .eq("transaction_id", reference)
      .single()

    if (existing) {
      return NextResponse.json({ received: true })
    }

    // 🔥 CALL ATOMIC VOTE FUNCTION
    await supabase.rpc("process_vote", {
      p_event_id: metadata.eventId,
      p_candidate_id: metadata.candidateId,
      p_quantity: metadata.quantity,
      p_voter_id: null,
      p_voter_phone: metadata.phone || null,
      p_vote_source: "online",
      p_payment_method: "paystack",
      p_transaction_id: reference,
      p_ip_address: null,
      p_amount_paid: data.amount / 100
    })

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 })
  }
}
