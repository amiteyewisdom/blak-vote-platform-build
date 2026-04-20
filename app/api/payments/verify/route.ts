import { NextRequest, NextResponse } from "next/server"
import { paymentService } from '@/lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const { reference, provider } = await request.json()

    if (!reference) {
      return NextResponse.json(
        { error: "Reference required" },
        { status: 400 }
      )
    }

    let verification
    try {
      verification = await paymentService.verifyPayment({
        provider: provider === 'nalo' ? 'nalo' : provider === 'paypal' ? 'paypal' : 'paystack',
        referenceId: reference,
      })
    } catch (error: any) {
      const message = error?.message || 'Unable to verify payment with provider'
      const lowered = String(message).toLowerCase()

      const status =
        lowered.includes('not found') || lowered.includes('invalid')
          ? 404
          : lowered.includes('unable to verify') || lowered.includes('timed out') || lowered.includes('network')
            ? 502
            : 400

      return NextResponse.json(
        { error: message },
        { status }
      )
    }

    // Never run vote creation flow unless payment is explicitly successful.
    if (!['success', 'paid', 'completed', 'processed'].includes(String(verification.status || '').toLowerCase())) {
      return NextResponse.json(
        { error: 'Payment not successful' },
        { status: 400 }
      )
    }

    const result = await paymentService.handleSuccess(verification)
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    console.error(
      "Verification error:",
      error.message
    )

    return NextResponse.json(
      { error: error?.message || "Verification failed" },
      { status: 500 }
    )
  }
}
