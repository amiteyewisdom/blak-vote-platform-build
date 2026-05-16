import { NextRequest, NextResponse } from 'next/server'
import {
  logAudit,
  logPaymentVerificationFailure,
  logRateLimitViolation,
} from '@/lib/audit-logging'
import { paymentService } from '@/lib/payment-service'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  getSupabaseAdminClient,
  hasTrustedOrigin,
  isValidPaystackSignature,
} from '@/lib/server-security'

const PAYMENT_INIT_IP_LIMIT = 20
const PAYMENT_INIT_IP_WINDOW_MS = 60 * 1000
const PAYMENT_INIT_EMAIL_LIMIT = 5
const PAYMENT_INIT_EMAIL_WINDOW_MS = 60 * 60 * 1000
const PAYMENT_VERIFY_IP_LIMIT = 25
const PAYMENT_VERIFY_IP_WINDOW_MS = 10 * 60 * 1000
const PAYMENT_VERIFY_REFERENCE_LIMIT = 8
const PAYMENT_VERIFY_REFERENCE_WINDOW_MS = 15 * 60 * 1000

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function handlePaymentInitializeRequest(
  request: NextRequest,
  endpoint: string
): Promise<NextResponse> {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      await logAudit({
        action: 'PAYMENT_INIT_CROSS_SITE_BLOCKED',
        severity: 'warning',
        ip_address: ipAddress,
        details: { endpoint },
      })

      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const ipLimit = checkRateLimit(
      `payment:init:ip:${endpoint}:${ipAddress}`,
      PAYMENT_INIT_IP_LIMIT,
      PAYMENT_INIT_IP_WINDOW_MS
    )

    if (!ipLimit.allowed) {
      await logRateLimitViolation(endpoint, ipAddress, PAYMENT_INIT_IP_LIMIT)

      return jsonNoStore(
        { error: 'Too many payment attempts. Please try again in a few minutes.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(ipLimit.retryAfterMs) },
        }
      )
    }

    const body = await request.json()
    const emailValue = body?.email || body?.buyerEmail
    const normalizedEmail =
      typeof emailValue === 'string' && emailValue.trim().length > 0
        ? emailValue.trim().toLowerCase()
        : null

    if (normalizedEmail) {
      const emailLimit = checkRateLimit(
        `payment:init:email:${endpoint}:${normalizedEmail}`,
        PAYMENT_INIT_EMAIL_LIMIT,
        PAYMENT_INIT_EMAIL_WINDOW_MS
      )

      if (!emailLimit.allowed) {
        await logAudit({
          action: 'RATE_LIMIT_EXCEEDED',
          severity: 'warning',
          ip_address: ipAddress,
          details: {
            endpoint,
            attemptCount: PAYMENT_INIT_EMAIL_LIMIT,
            email: normalizedEmail,
          },
        })

        return jsonNoStore(
          { error: 'Too many payment attempts with this email. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': getRetryAfterSeconds(emailLimit.retryAfterMs) },
          }
        )
      }
    }

    const result = await paymentService.initiatePayment(body)
    return jsonNoStore(result.body, { status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment initialization failed'

    await logAudit({
      action: 'PAYMENT_INIT_FAILED',
      severity: 'warning',
      ip_address: ipAddress,
      details: {
        endpoint,
        message,
      },
    })

    console.error('[payment-init]', endpoint, message)
    return jsonNoStore({ error: 'Payment initialization failed' }, { status: 500 })
  }
}

export async function handlePaymentVerificationRequest(
  request: NextRequest,
  endpoint: string
): Promise<NextResponse> {
  const ipAddress = extractClientIp(request)
  let reference = ''

  try {
    if (!hasTrustedOrigin(request)) {
      await logAudit({
        action: 'PAYMENT_VERIFY_CROSS_SITE_BLOCKED',
        severity: 'warning',
        ip_address: ipAddress,
        details: { endpoint },
      })

      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = await request.json()
    reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
    const provider =
      body?.provider === 'nalo'
        ? 'nalo'
        : body?.provider === 'paypal'
          ? 'paypal'
          : 'paystack'

    if (!reference) {
      await logPaymentVerificationFailure('missing-reference', 'Reference required', ipAddress)
      return jsonNoStore({ error: 'Reference required' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(
      `payment:verify:ip:${endpoint}:${ipAddress}`,
      PAYMENT_VERIFY_IP_LIMIT,
      PAYMENT_VERIFY_IP_WINDOW_MS
    )
    const referenceLimit = checkRateLimit(
      `payment:verify:reference:${endpoint}:${reference.toLowerCase()}`,
      PAYMENT_VERIFY_REFERENCE_LIMIT,
      PAYMENT_VERIFY_REFERENCE_WINDOW_MS
    )

    if (!ipLimit.allowed || !referenceLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, referenceLimit.retryAfterMs)
      await logRateLimitViolation(endpoint, ipAddress, PAYMENT_VERIFY_IP_LIMIT)

      return jsonNoStore(
        { error: 'Too many verification attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    let verification
    try {
      verification = await paymentService.verifyPayment({
        provider,
        referenceId: reference,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify payment with provider'
      const lowered = message.toLowerCase()

      await logPaymentVerificationFailure(reference, message, ipAddress)

      const status =
        lowered.includes('not found') || lowered.includes('invalid')
          ? 404
          : lowered.includes('unable to verify') || lowered.includes('timed out') || lowered.includes('network')
            ? 502
            : 400

      return jsonNoStore({ error: message }, { status })
    }

    if (!['success', 'paid', 'completed', 'processed'].includes(String(verification.status || '').toLowerCase())) {
      await logPaymentVerificationFailure(reference, 'Payment not successful', ipAddress)
      return jsonNoStore({ error: 'Payment not successful' }, { status: 400 })
    }

    const result = await paymentService.handleSuccess(verification)

    if (!result.ok) {
      const errorMessage =
        result.body && typeof result.body === 'object' && 'error' in result.body
          ? String(result.body.error)
          : 'Payment verification handling failed'

      await logPaymentVerificationFailure(reference, errorMessage, ipAddress)
    }

    return jsonNoStore(result.body, { status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    await logPaymentVerificationFailure(reference || 'unknown-reference', message, ipAddress)
    console.error('[payment-verify]', endpoint, message)
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function handlePaystackWebhookRequest(
  request: Request,
  endpoint: string
): Promise<NextResponse> {
  const ipAddress = extractClientIp(request)

  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    if (!signature) {
      await logAudit({
        action: 'PAYMENT_WEBHOOK_INVALID_SIGNATURE',
        severity: 'critical',
        ip_address: ipAddress,
        details: { endpoint, reason: 'Missing signature' },
      })

      return jsonNoStore({ error: 'Missing signature' }, { status: 400 })
    }

    if (!isValidPaystackSignature(rawBody, signature)) {
      await logAudit({
        action: 'PAYMENT_WEBHOOK_INVALID_SIGNATURE',
        severity: 'critical',
        ip_address: ipAddress,
        details: { endpoint, reason: 'Invalid signature' },
      })

      return jsonNoStore({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)

    if (payload.event !== 'charge.success') {
      return jsonNoStore({ received: true })
    }

    const { reference, amount, metadata, status } = payload.data ?? {}

    if (!reference) {
      await logAudit({
        action: 'PAYMENT_WEBHOOK_INVALID_PAYLOAD',
        severity: 'warning',
        ip_address: ipAddress,
        details: { endpoint, reason: 'Missing payment reference' },
      })

      return jsonNoStore({ error: 'Missing payment reference' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('vote_id, ticket_id')
      .eq('reference', reference)
      .maybeSingle()

    if (existingPayment?.vote_id || existingPayment?.ticket_id) {
      return jsonNoStore({ received: true })
    }

    const result = await paymentService.handleSuccess({
      provider: 'paystack',
      paymentMethod: 'paystack',
      reference,
      amount: Number(amount) / 100,
      status,
      metadata,
    })

    if (!result.ok) {
      const message =
        result.body && typeof result.body === 'object' && 'error' in result.body
          ? String(result.body.error)
          : 'Webhook payment handling failed'

      await logAudit({
        action: 'PAYMENT_WEBHOOK_PROCESSING_FAILED',
        severity: 'warning',
        ip_address: ipAddress,
        details: { endpoint, reference, message },
      })

      return jsonNoStore(result.body, { status: result.status })
    }

    return jsonNoStore({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed'

    await logAudit({
      action: 'PAYMENT_WEBHOOK_ERROR',
      severity: 'critical',
      ip_address: ipAddress,
      details: { endpoint, message },
    })

    console.error('[payment-webhook]', endpoint, message)
    return jsonNoStore({ error: 'Webhook failed' }, { status: 500 })
  }
}