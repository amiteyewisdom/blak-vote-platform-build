import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { paymentService } from '@/lib/payment-service'
import { getSupabaseAdminClient } from '@/lib/server-security'

type UssdTransactionStatus = 'pending' | 'paid' | 'failed'

type UssdTicketPlan = {
  id: string
  name: string | null
  optionNumber: number | null
}

export type UssdPendingTransaction = {
  id: string
  phoneNumber: string
  eventCode: string
  candidateCode: string | null
  ticketPlan: UssdTicketPlan | null
  quantity: number
  type: 'vote' | 'ticket'
  amount: number
  status: UssdTransactionStatus
  gatewayStatus: string | null
}

type CreateVotePendingTransactionInput = {
  id: string
  phoneNumber: string
  eventId: string
  organizerId?: string | null
  eventCode: string
  candidateId: string
  candidateCode: string
  quantity: number
  amount: number
}

type CreateTicketPendingTransactionInput = {
  id: string
  phoneNumber: string
  eventId: string
  organizerId?: string | null
  eventCode: string
  planId: string
  planName?: string | null
  planOptionNumber: number
  quantity: number
  amount: number
  buyerName: string
}

type CreatePendingTransactionInput =
  | ({ type: 'vote' } & CreateVotePendingTransactionInput)
  | ({ type: 'ticket' } & CreateTicketPendingTransactionInput)

function normalizeTransactionStatus(status: string | null | undefined): UssdTransactionStatus {
  const normalized = String(status || '').trim().toLowerCase()

  if (['paid', 'success', 'processed', 'completed'].includes(normalized)) {
    return 'paid'
  }

  if (['failed', 'cancelled', 'canceled', 'abandoned', 'expired'].includes(normalized)) {
    return 'failed'
  }

  return 'pending'
}

function buildSyntheticTicketBuyerEmail(phoneNumber: string) {
  const phoneIdentifier = String(phoneNumber || '').trim().slice(0, 20)
  return `ussd+${phoneIdentifier}@blakvote.local`
}

function mapExistingTransaction(params: {
  id: string
  phoneNumber: string
  eventCode: string
  quantity: number
  type: 'vote' | 'ticket'
  amount: number
  status: string | null | undefined
  gatewayStatus: string | null | undefined
  candidateCode?: string | null
  ticketPlan?: UssdTicketPlan | null
}): UssdPendingTransaction {
  return {
    id: params.id,
    phoneNumber: params.phoneNumber,
    eventCode: params.eventCode,
    candidateCode: params.candidateCode ?? null,
    ticketPlan: params.ticketPlan ?? null,
    quantity: params.quantity,
    type: params.type,
    amount: Number(params.amount.toFixed(2)),
    status: normalizeTransactionStatus(params.status),
    gatewayStatus: params.gatewayStatus ? String(params.gatewayStatus) : null,
  }
}

export function buildUssdTransactionId(seed: string) {
  return `USSD-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 28)}`
}

export async function createOrReuseUssdPendingTransaction(
  input: CreatePendingTransactionInput
): Promise<UssdPendingTransaction> {
  const supabase = getSupabaseAdminClient()

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from('payments')
    .select('reference, status, gateway_status')
    .eq('reference', input.id)
    .maybeSingle()

  if (existingPaymentError) {
    throw new Error(existingPaymentError.message)
  }

  const ticketPlan =
    input.type === 'ticket'
      ? {
          id: input.planId,
          name: input.planName ?? null,
          optionNumber: input.planOptionNumber,
        }
      : null

  if (existingPayment) {
    return mapExistingTransaction({
      id: String(existingPayment.reference || input.id),
      phoneNumber: input.phoneNumber,
      eventCode: input.eventCode,
      candidateCode: input.type === 'vote' ? input.candidateCode : null,
      ticketPlan,
      quantity: input.quantity,
      type: input.type,
      amount: input.amount,
      status: existingPayment.status,
      gatewayStatus: existingPayment.gateway_status,
    })
  }

  const baseInsert = {
    reference: input.id,
    event_id: input.eventId,
    organizer_id: input.organizerId ?? null,
    quantity: input.quantity,
    voter_phone: input.phoneNumber,
    amount: Number(input.amount.toFixed(2)),
    currency: 'GHS',
    status: 'pending',
    payment_method: 'momo',
    provider: 'nalo',
    gateway_status: 'initialized',
    payment_context: input.type,
  }

  const insertPayload =
    input.type === 'vote'
      ? {
          ...baseInsert,
          candidate_id: input.candidateId,
          voter_email: null,
          metadata: {
            paymentFor: 'vote',
            eventId: input.eventId,
            eventCode: input.eventCode,
            candidateId: input.candidateId,
            candidateCode: input.candidateCode,
            quantity: input.quantity,
            amount: Number(input.amount.toFixed(2)),
            phone: input.phoneNumber,
            email: null,
          },
        }
      : {
          ...baseInsert,
          candidate_id: null,
          voter_email: buildSyntheticTicketBuyerEmail(input.phoneNumber),
          metadata: {
            paymentFor: 'ticket',
            eventId: input.eventId,
            eventCode: input.eventCode,
            ticketId: input.planId,
            quantity: input.quantity,
            buyerName: input.buyerName,
            buyerEmail: buildSyntheticTicketBuyerEmail(input.phoneNumber),
            buyerPhone: input.phoneNumber,
            ticketPlan: {
              id: input.planId,
              name: input.planName ?? null,
              optionNumber: input.planOptionNumber,
            },
          },
        }

  const { data: createdPayment, error: createPaymentError } = await supabase
    .from('payments')
    .insert(insertPayload)
    .select('reference, status, gateway_status')
    .single()

  if (createPaymentError || !createdPayment) {
    throw new Error(createPaymentError?.message || 'Unable to create pending USSD transaction')
  }

  return mapExistingTransaction({
    id: String(createdPayment.reference || input.id),
    phoneNumber: input.phoneNumber,
    eventCode: input.eventCode,
    candidateCode: input.type === 'vote' ? input.candidateCode : null,
    ticketPlan,
    quantity: input.quantity,
    type: input.type,
    amount: input.amount,
    status: createdPayment.status,
    gatewayStatus: createdPayment.gateway_status,
  })
}

export async function updateUssdPendingTransaction(reference: string, updates: {
  status?: string
  gatewayStatus?: string | null
}) {
  const supabase = getSupabaseAdminClient()

  const payload: Record<string, unknown> = {}
  if (typeof updates.status === 'string') {
    payload.status = updates.status
  }
  if (updates.gatewayStatus !== undefined) {
    payload.gateway_status = updates.gatewayStatus
  }

  if (Object.keys(payload).length === 0) {
    return
  }

  const { error } = await supabase
    .from('payments')
    .update(payload)
    .eq('reference', reference)

  if (error) {
    throw new Error(error.message)
  }
}

type InitiateMoMoPaymentInput = {
  phone: string
  amount: number
  reference: string
  accountName?: string | null
  description?: string | null
}

const NALO_CONFIRMED_STATUSES = ['success', 'paid', 'completed', 'processed']
const NALO_PENDING_STATUSES = ['pending', 'processing', 'queued', 'initiated', 'in_progress']
const NALO_FAILED_STATUSES = ['failed', 'cancelled', 'canceled', 'abandoned', 'expired', 'rejected']

function readResponseMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as Record<string, unknown>

  for (const key of ['message', 'detail', 'description', 'error']) {
    const value = candidate[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function normalizeMsisdn(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '')

  if (digits.startsWith('233') && digits.length >= 12) {
    return digits
  }

  if (digits.startsWith('0') && digits.length >= 10) {
    return `233${digits.slice(1)}`
  }

  return digits
}

function inferNaloNetwork(msisdn: string) {
  const normalized = normalizeMsisdn(msisdn)
  const localPrefix = normalized.startsWith('233') ? normalized.slice(3, 5) : normalized.slice(0, 2)

  if (['24', '25', '53', '54', '55', '59'].includes(localPrefix)) {
    return 'MTN'
  }

  if (['20', '50'].includes(localPrefix)) {
    return 'TELECEL'
  }

  if (['26', '27', '56', '57'].includes(localPrefix)) {
    return 'AT'
  }

  return null
}

function getSiteBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL

  if (!raw || !raw.trim().toLowerCase().startsWith('http')) {
    if (process.env.NODE_ENV !== 'production') {
      return 'http://localhost:3000'
    }

    throw new Error('Invalid callback base URL')
  }

  return raw.trim().replace(/\/$/, '')
}

function getNaloCallbackUrl() {
  const configured =
    process.env.NALO_CALLBACK_URL?.trim() || process.env.NALO_WEBHOOK_URL?.trim()

  if (configured) {
    return configured
  }

  return `${getSiteBaseUrl()}/api/nalo/webhook`
}

function resolveNaloBaseUrl() {
  const configured =
    process.env.NALO_BASE_URL?.trim() || process.env.NALO_PAYMENT_API_URL?.trim()

  if (!configured) {
    throw new Error('Missing required environment variable: NALO_BASE_URL')
  }

  return configured.replace(/\/$/, '')
}

function resolveNaloPaymentEndpoint() {
  const configured = process.env.NALO_PAYMENT_API_URL?.trim()

  if (!configured) {
    return `${resolveNaloBaseUrl()}/clientapi/collection/`
  }

  if (/\/clientapi\/collection\/?$/i.test(configured)) {
    return configured
  }

  return `${configured.replace(/\/$/, '')}/clientapi/collection`
}

function resolveNaloTokenEndpoint() {
  const configured = process.env.NALO_PAYMENT_TOKEN_URL?.trim()

  if (!configured) {
    return `${resolveNaloBaseUrl()}/clientapi/generate-payment-token/`
  }

  if (/\/clientapi\/generate-payment-token\/?$/i.test(configured)) {
    return configured
  }

  return `${configured.replace(/\/$/, '')}/clientapi/generate-payment-token/`
}

function buildNaloTransactionHash(params: {
  merchantId: string
  reference: string
  amount: number
  msisdn: string
}) {
  const explicitHash =
    process.env.NALO_TRANS_HASH?.trim() || process.env.NALO_PAYMENT_TRANS_HASH?.trim()

  if (explicitHash) {
    return explicitHash
  }

  const secret =
    process.env.NALO_TRANS_HASH_SECRET?.trim() ||
    process.env.NALO_PAYMENT_TRANS_HASH_SECRET?.trim()

  if (!secret) {
    throw new Error(
      'Missing required Nalo transaction hash configuration: set NALO_TRANS_HASH or NALO_TRANS_HASH_SECRET'
    )
  }

  const raw = `${params.merchantId}${params.msisdn}${params.amount.toFixed(2)}${params.reference}`
  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

async function generateNaloPaymentToken(params: { merchantId: string }) {
  const endpoint = resolveNaloTokenEndpoint()
  const basicAuthHeader =
    process.env.NALO_BASIC_AUTH_HEADER?.trim() || process.env.NALO_BASIC_AUTH_TOKEN?.trim()

  if (!basicAuthHeader) {
    throw new Error('Missing required environment variable: NALO_BASIC_AUTH_HEADER')
  }

  const headers = {
    Authorization: basicAuthHeader.startsWith('Basic ')
      ? basicAuthHeader
      : `Basic ${basicAuthHeader}`,
    'Content-Type': 'application/json',
  }

  const payload = {
    merchant_id: params.merchantId,
  }

  console.info('[NALO_TOKEN_REQUEST]', {
    endpoint,
    headers: sanitizeNaloHeadersForLog(headers),
    payload,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const rawBody = await response.text()
  let parsedBody: unknown = rawBody

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = rawBody
    }
  }

  console.info('[NALO_TOKEN_RESPONSE]', {
    endpoint,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    body: parsedBody,
  })

  if (!response.ok) {
    throw new Error(
      readResponseMessage(parsedBody) || `Nalo token generation failed with status ${response.status}`
    )
  }

  const token =
    parsedBody &&
    typeof parsedBody === 'object' &&
    'data' in parsedBody &&
    parsedBody.data &&
    typeof parsedBody.data === 'object' &&
    'token' in parsedBody.data &&
    typeof parsedBody.data.token === 'string'
      ? parsedBody.data.token
      : null

  if (!token) {
    throw new Error('Nalo token generation response missing JWT token')
  }

  return token
}

function sanitizeNaloHeadersForLog(headers: Record<string, string>) {
  const sanitized = { ...headers }

  for (const key of Object.keys(sanitized)) {
    if (['authorization', 'token', 'x-api-key'].includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    }
  }

  return sanitized
}

export async function initiateMoMoPayment(input: InitiateMoMoPaymentInput) {
  const endpoint = resolveNaloPaymentEndpoint()
  const merchantId =
    process.env.NALO_MERCHANT_ID?.trim() || process.env.NALO_PAYMENT_MERCHANT_ID?.trim()

  if (!merchantId) {
    throw new Error('Missing required environment variable: NALO_MERCHANT_ID')
  }

  const msisdn = normalizeMsisdn(input.phone)
  if (!msisdn) {
    throw new Error('MoMo payment initiation requires a valid phone number')
  }

  const configuredNetwork =
    process.env.NALO_PAYMENT_NETWORK?.trim() || process.env.NALO_NETWORK?.trim()
  const network = configuredNetwork || inferNaloNetwork(msisdn)

  if (!network) {
    throw new Error(
      'Unable to determine Nalo network for this MSISDN. Set NALO_PAYMENT_NETWORK explicitly.'
    )
  }

  const callbackUrl = getNaloCallbackUrl()
  const amount = Number(input.amount.toFixed(2))
  const description =
    input.description?.trim() || process.env.NALO_PAYMENT_DESCRIPTION?.trim() || 'BlakVote USSD payment'
  const accountName = input.accountName?.trim() || process.env.NALO_PAYMENT_ACCOUNT_NAME?.trim() || 'USSD Customer'
  const transHash = buildNaloTransactionHash({
    merchantId,
    reference: input.reference,
    amount,
    msisdn,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  headers.token = await generateNaloPaymentToken({ merchantId })

  const payload: Record<string, unknown> = {
    merchant_id: merchantId,
    service_name: 'MOMO_TRANSACTION',
    trans_hash: transHash,
    account_number: msisdn,
    account_name: accountName,
    description,
    reference: input.reference,
    network,
    amount,
    callback: callbackUrl,
    extra_data: {
      reference: input.reference,
    },
  }

  console.info('[NALO_MOMO_INIT_REQUEST]', {
    endpoint,
    headers: sanitizeNaloHeadersForLog(headers),
    payload,
  })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const rawBody = await response.text()
    let parsedBody: unknown = rawBody

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        parsedBody = rawBody
      }
    }

    console.info('[NALO_MOMO_INIT_RESPONSE]', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: parsedBody,
    })

    if (!response.ok) {
      throw new Error(
        readResponseMessage(parsedBody) ||
          `MoMo payment initiation failed with status ${response.status}`
      )
    }

    return parsedBody
  } catch (error: any) {
    console.error('[NALO_MOMO_INIT_ERROR]', {
      endpoint,
      payload,
      message: error?.message || 'Unknown Nalo initiation error',
      cause: error?.cause ?? null,
      stack: error?.stack ?? null,
    })
    throw error
  }
}

function normalizeWebhookStatus(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase()
}

function stripSignaturePrefix(signature: string) {
  return signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature
}

function isValidNaloWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.NALO_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return true
  }

  if (!signature) {
    return false
  }

  const normalizedSignature = stripSignaturePrefix(signature.trim())

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    const receivedBuffer = Buffer.from(normalizedSignature, 'hex')

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  } catch {
    return false
  }
}

function parseNaloWebhookPayload(rawBody: string, contentType: string) {
  if (!rawBody.trim()) {
    return {}
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries())
  }

  try {
    return JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return Object.fromEntries(new URLSearchParams(rawBody).entries())
  }
}

export async function handleNaloWebhookRequest(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    const rawBody = await request.text()
    const signature =
      request.headers.get('x-nalo-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('x-webhook-signature')

    if (!isValidNaloWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const payload = parseNaloWebhookPayload(rawBody, contentType)
    const verification = await paymentService.verifyPayment({
      provider: 'nalo',
      payload,
    })

    const normalizedStatus = normalizeWebhookStatus(verification.status)

    if (NALO_CONFIRMED_STATUSES.includes(normalizedStatus)) {
      const result = await paymentService.handleSuccess(verification)
      return NextResponse.json(result.body, { status: result.status })
    }

    if (NALO_PENDING_STATUSES.includes(normalizedStatus)) {
      await updateUssdPendingTransaction(verification.reference, {
        status: 'pending',
        gatewayStatus: normalizedStatus,
      })

      return NextResponse.json(
        { received: true, status: normalizedStatus, action: 'awaiting_confirmation' },
        { status: 202 }
      )
    }

    if (NALO_FAILED_STATUSES.includes(normalizedStatus)) {
      await updateUssdPendingTransaction(verification.reference, {
        status: 'failed',
        gatewayStatus: normalizedStatus,
      })

      return NextResponse.json(
        { received: true, status: normalizedStatus, action: 'payment_failed' },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { received: true, status: normalizedStatus || 'unknown', action: 'ignored' },
      { status: 202 }
    )
  } catch (error: any) {
    console.error('Nalo webhook error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Nalo webhook failed' },
      { status: 500 }
    )
  }
}