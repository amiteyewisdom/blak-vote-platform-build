import { NextRequest, NextResponse } from 'next/server'
import { paymentService } from '@/lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await paymentService.initiatePayment(body)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error: any) {
    console.error('Payment init alias error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Payment initialization failed' },
      { status: 500 }
    )
  }
}
