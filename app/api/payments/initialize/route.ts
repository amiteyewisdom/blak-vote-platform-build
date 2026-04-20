import { NextRequest, NextResponse } from 'next/server'
import { paymentService } from '@/lib/payment-service'
import { extractClientIp, checkRateLimit } from '@/lib/server-security'

export async function POST(request: NextRequest) {
  try {
    // =========================================================================
    // CRITICAL FIX #1: Rate limiting on payment initialization
    // Prevents spam/abuse of payment endpoint
    // =========================================================================
    const ipAddress = extractClientIp(request)
    
    // Rate limit per IP: 20 payment init attempts per minute
    const ipLimit = checkRateLimit(`payment:init:ip:${ipAddress}`, 20, 60 * 1000)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many payment attempts. Please try again in a few minutes.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(ipLimit.retryAfterMs / 1000)) },
        }
      )
    }

    const body = await request.json()
    const email = body.email || body.buyerEmail

    // Rate limit per email: 5 payment init attempts per hour
    if (email) {
      const emailNormalized = String(email).toLowerCase().trim()
      const emailLimit = checkRateLimit(`payment:init:email:${emailNormalized}`, 5, 3600 * 1000)
      if (!emailLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many payment attempts with this email. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil(emailLimit.retryAfterMs / 1000)) },
          }
        )
      }
    }

    // Log payment initialization for fraud monitoring
    console.log(`[PAYMENT_INIT] IP: ${ipAddress}, Email: ${email ? 'present' : 'none'}, Timestamp: ${new Date().toISOString()}`)

    const result = await paymentService.initiatePayment(body)
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    console.error(
      'Paystack initialize error:',
      error.message,
      { timestamp: new Date().toISOString() }
    )

    return NextResponse.json(
      { error: 'Payment initialization failed' },
      { status: 500 }
    )
  }
}
