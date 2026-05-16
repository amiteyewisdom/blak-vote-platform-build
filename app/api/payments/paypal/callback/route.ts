import { NextRequest, NextResponse } from 'next/server'
import { logPaymentVerificationFailure, logRateLimitViolation } from '@/lib/audit-logging'
import { paymentService } from '@/lib/payment-service'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

const PAYPAL_VERIFY_IP_LIMIT = 25
const PAYPAL_VERIFY_IP_WINDOW_MS = 10 * 60 * 1000
const PAYPAL_VERIFY_REFERENCE_LIMIT = 8
const PAYPAL_VERIFY_REFERENCE_WINDOW_MS = 15 * 60 * 1000

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)
  let referenceId = ''

  try {
    if (!hasTrustedOrigin(request)) {
      await logPaymentVerificationFailure('paypal-callback', 'Cross-site request blocked.', ipAddress)
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    referenceId = String(
      body.referenceId ?? body.reference_id ?? body.reference ?? body.orderId ?? body.order_id ?? ''
    ).trim()

    if (!referenceId) {
      await logPaymentVerificationFailure('paypal-callback', 'Reference required', ipAddress)
      return jsonNoStore({ error: 'Reference required' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(
      `payment:verify:paypal:ip:${ipAddress}`,
      PAYPAL_VERIFY_IP_LIMIT,
      PAYPAL_VERIFY_IP_WINDOW_MS
    )
    const referenceLimit = checkRateLimit(
      `payment:verify:paypal:reference:${referenceId.toLowerCase()}`,
      PAYPAL_VERIFY_REFERENCE_LIMIT,
      PAYPAL_VERIFY_REFERENCE_WINDOW_MS
    )

    if (!ipLimit.allowed || !referenceLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, referenceLimit.retryAfterMs)
      await logRateLimitViolation('app/api/payments/paypal/callback', ipAddress, PAYPAL_VERIFY_IP_LIMIT)

      return jsonNoStore(
        { error: 'Too many verification attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const verification = await paymentService.verifyPayment({
      provider: 'paypal',
      referenceId,
      amount: body.amount,
      status: body.status,
      metadata: body.metadata ?? body,
    })

    if (!['success', 'paid', 'completed', 'processed'].includes(String(verification.status || '').toLowerCase())) {
      await logPaymentVerificationFailure(referenceId, 'Payment not successful', ipAddress)
      return jsonNoStore({ error: 'Payment not successful' }, { status: 400 })
    }

    const result = await paymentService.handleSuccess(verification)

    if (!result.ok) {
      const message =
        result.body && typeof result.body === 'object' && 'error' in result.body
          ? String(result.body.error)
          : 'PayPal callback handling failed'

      await logPaymentVerificationFailure(referenceId, message, ipAddress)
    }

    return jsonNoStore(result.body, { status: result.status })
  } catch (error: any) {
    const message = error?.message || 'PayPal callback failed'
    await logPaymentVerificationFailure(referenceId || 'paypal-callback', message, ipAddress)
    console.error('PayPal callback error:', message)
    return jsonNoStore({ error: message }, { status: 500 })
  }
}