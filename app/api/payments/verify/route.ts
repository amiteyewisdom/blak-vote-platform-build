import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { reference } = await request.json()

    if (!reference) {
      return NextResponse.json(
        { error: "Reference required" },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 🔥 1️⃣ Prevent double processing
    const { data: existingVote } = await supabase
      .from("votes")
      .select("id")
      .eq("transaction_id", reference)
      .single()

    if (existingVote) {
      return NextResponse.json(
        { error: "Transaction already processed" },
        { status: 400 }
      )
    }

    // 🔥 2️⃣ Verify with Paystack
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    )

    const data = verifyResponse.data.data

    if (data.status !== "success") {
      return NextResponse.json(
        { error: "Payment not successful" },
        { status: 400 }
      )
    }

    const metadata = data.metadata

    if (!metadata?.eventId || !metadata?.candidateId) {
      return NextResponse.json(
        { error: "Invalid payment metadata" },
        { status: 400 }
      )
    }

    // 🔥 3️⃣ Re-check event is still published
    const { data: event } = await supabase
      .from("events")
      .select("status")
      .eq("id", metadata.eventId)
      .single()

    if (!event || event.status !== "published") {
      return NextResponse.json(
        { error: "Voting is closed for this event" },
        { status: 403 }
      )
    }

    // 🔥 4️⃣ Process vote atomically
    const { error } = await supabase.rpc("process_vote", {
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

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error(
      "Verification error:",
      error.response?.data || error.message
    )

    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    )
  }
}
