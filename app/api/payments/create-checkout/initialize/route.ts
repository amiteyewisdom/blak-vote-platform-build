import { NextRequest, NextResponse } from "next/server"
import { paymentService } from '@/lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await paymentService.initiatePayment(body)
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    console.error("Paystack init error:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Payment initialization failed" },
      { status: 500 }
    )
  }
}
