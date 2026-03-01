import { NextRequest, NextResponse } from "next/server"
import axios from "axios"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, amount, eventId, candidateId, quantity } = body

    if (!email || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const reference = crypto.randomUUID()

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100, // Paystack uses kobo
        reference,
        metadata: {
          eventId,
          candidateId,
          quantity
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    return NextResponse.json(response.data.data)

  } catch (error: any) {
    console.error("Paystack init error:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Payment initialization failed" },
      { status: 500 }
    )
  }
}
