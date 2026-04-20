import { NextRequest, NextResponse } from 'next/server'
import { paymentService } from '@/lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const verification = await paymentService.verifyPayment({
      provider: 'paypal',
      referenceId:
        body.referenceId ?? body.reference_id ?? body.reference ?? body.orderId ?? body.order_id,
      amount: body.amount,
      status: body.status,
      metadata: body.metadata ?? body,
    })

    const result = await paymentService.handleSuccess(verification)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error: any) {
    console.error('PayPal callback error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'PayPal callback failed' },
      { status: 500 }
    )
  }
}