import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { paymentService } from '@/lib/payment-service'
import { extractClientIp, getAllowedIps, isRequestFromAllowedIps } from '@/lib/server-security'
import { getSupabaseAdminClient } from '@/lib/server-security'

type UssdTransactionStatus = 'pending' | 'paid' | 'failed'

type ProcessSuccessResultBody = {
  resource?: 'vote' | 'ticket'
  eventId?: string
  paymentId?: string
  ticketCode?: string | null
  ticketCodes?: string[]
  [key: string]: unknown
}

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

function isLegacyBigIntIdError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('invalid input syntax for type bigint')
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
            organizerId: input.organizerId ?? null,
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
            organizerId: input.organizerId ?? null,
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

  let { data: createdPayment, error: createPaymentError } = await supabase
    .from('payments')
    .insert(insertPayload)
    .select('reference, status, gateway_status')
    .single()

  if (createPaymentError && isLegacyBigIntIdError(createPaymentError)) {
    const metadataOnlyPayload = {
      ...baseInsert,
      event_id: input.eventId,
      ...(input.type === 'vote'
        ? {
            candidate_id: null,
            voter_email: null,
            metadata: {
              paymentFor: 'vote',
              eventId: input.eventId,
              organizerId: input.organizerId ?? null,
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
            candidate_id: null,
            voter_email: buildSyntheticTicketBuyerEmail(input.phoneNumber),
            metadata: {
              paymentFor: 'ticket',
              eventId: input.eventId,
              organizerId: input.organizerId ?? null,
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
          }),
    }

    const retryResult = await supabase
      .from('payments')
      .insert(metadataOnlyPayload)
      .select('reference, status, gateway_status')
      .single()

    createdPayment = retryResult.data
    createPaymentError = retryResult.error
  }

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

async function getEventTitleById(eventId: string): Promise<string | null> {
  if (!eventId) return null
  const supabase = getSupabaseAdminClient()
  const { data } = await supabase
    .from('events')
    .select('title')
    .eq('id', eventId)
    .maybeSingle()
  return typeof data?.title === 'string' ? data.title : null
}

async function getVoteInfoForSms(
  voteId: string,
  eventId: string
): Promise<{ candidateName: string; eventTitle: string; quantity: number } | null> {
  if (!voteId) return null
  const supabase = getSupabaseAdminClient()
  const { data: voteRow } = await supabase
    .from('votes')
    .select('quantity, candidate_id, event_id')
    .eq('id', voteId)
    .maybeSingle()
  if (!voteRow) return null

  const effectiveEventId = eventId || String(voteRow.event_id || '')
  const [{ data: nomination }, { data: eventRow }] = await Promise.all([
    supabase
      .from('nominations')
      .select('nominee_name')
      .eq('id', voteRow.candidate_id)
      .maybeSingle(),
    supabase
      .from('events')
      .select('title')
      .eq('id', effectiveEventId)
      .maybeSingle(),
  ])

  return {
    candidateName:
      typeof nomination?.nominee_name === 'string' && nomination.nominee_name.trim()
        ? nomination.nominee_name.trim()
        : 'your candidate',
    eventTitle:
      typeof eventRow?.title === 'string' && eventRow.title.trim()
        ? eventRow.title.trim()
        : 'the event',
    quantity: Number(voteRow.quantity || 1),
  }
}

async function getPaymentPhoneByReference(reference: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('payments')
    .select('voter_phone')
    .eq('reference', reference)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const raw = String(data?.voter_phone || '').trim()
  if (!raw) {
    return null
  }

  return normalizeMsisdn(raw)
}

function getTicketCodesFromResultBody(body: ProcessSuccessResultBody | null | undefined) {
  const codes = Array.isArray(body?.ticketCodes)
    ? body!.ticketCodes.filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    : []

  if (codes.length > 0) {
    return codes
  }

  if (typeof body?.ticketCode === 'string' && body.ticketCode.trim().length > 0) {
    return [body.ticketCode.trim()]
  }

  return []
}

// ---------------------------------------------------------------------------
// Nalo SMS sending
// ---------------------------------------------------------------------------

function normalizeGhanaPhone(phone: string): string {
  let p = String(phone || '').trim()
  // Remove spaces, dashes, parentheses
  p = p.replace(/[\s\-()]/g, '')
  // If it starts with +, remove it
  if (p.startsWith('+')) {
    p = p.slice(1)
  }
  // If it starts with 0, replace with 233
  if (p.startsWith('0')) {
    p = '233' + p.slice(1)
  }
  // If it doesn't have country code and is 9 digits, assume it's 233
  if (!p.startsWith('233') && !p.startsWith('0') && p.length === 9) {
    p = '233' + p
  }
  return p
}

export async function sendNaloSms(phoneNumber: string, message: string): Promise<void> {
  const normalizedPhone = normalizeGhanaPhone(phoneNumber)
  const usernamePrefix = process.env.NALO_SMS_USERNAME_PREFIX?.trim() || 'Resl_Nalo'
  const authKey = process.env.NALO_SMS_AUTH_KEY?.trim()
  const username = process.env.NALO_SMS_USERNAME?.trim()
  const password = process.env.NALO_SMS_PASSWORD?.trim()

  if (!authKey && !(username && password)) {
    console.warn('[NALO_SMS_SKIPPED_NO_AUTH]', { phoneNumber: normalizedPhone })
    return
  }

  if (!/^[0-9]{9,15}$/.test(normalizedPhone)) {
    console.warn('[NALO_SMS_SKIPPED_INVALID_PHONE]', { phoneNumber, normalizedPhone })
    return
  }

  const endpoint =
    process.env.NALO_SMS_API_URL?.trim() ||
    `https://sms.nalosolutions.com/smsbackend/clientapi/${encodeURIComponent(usernamePrefix)}/send-message/`
  const alternateEndpoint = endpoint.includes('/clientapi/')
    ? endpoint.replace('/clientapi/', '/')
    : null

  const source = process.env.NALO_SMS_SOURCE?.trim() || 'BLAKVOTE'
  const dlr = process.env.NALO_SMS_DLR?.trim() || '1'
  const type = process.env.NALO_SMS_TYPE?.trim() || '0'
  const callbackUrl = process.env.NALO_SMS_CALLBACK_URL?.trim()

  const query = new URLSearchParams()
  query.set('type', type)
  query.set('destination', normalizedPhone)
  query.set('dlr', dlr)
  query.set('source', source)
  query.set('message', message)

  if (callbackUrl) {
    query.set('callback_url', callbackUrl)
  }

  const headers = new Headers()
  let useQueryAuth = false
  let authMethod = 'unknown'
  const isBasicAuthKey = authKey?.trim().toLowerCase().startsWith('basic ') ?? false
  const rawAuthKey = isBasicAuthKey
    ? authKey!.trim().slice(6).trim()
    : authKey

  if (authKey) {
    if (isBasicAuthKey) {
      headers.set('Authorization', authKey.trim())
      authMethod = 'basic-header'
      if (rawAuthKey) {
        query.set('key', rawAuthKey)
      }
    } else {
      query.set('key', authKey)
      useQueryAuth = true
      authMethod = 'key-query'
    }
  } else {
    authMethod = 'username-password-header'
    const encoded = Buffer.from(`${username!}:${password!}`).toString('base64')
    headers.set('Authorization', `Basic ${encoded}`)
    query.set('username', username!)
    query.set('password', password!)
    useQueryAuth = true
  }

  const requestUrl = `${endpoint}?${query.toString()}`
  const alternateRequestUrl = alternateEndpoint ? `${alternateEndpoint}?${query.toString()}` : null

  // Attempt 1: GET with query params (legacy)
  let response = await fetch(requestUrl, {
    method: 'GET',
    headers,
  })

  let responseText = await response.text().catch(() => '')
  let normalizedResponse = String(responseText || '').trim().toLowerCase()

  // If GET fails with auth/server errors, try a series of fallbacks and log each attempt
  if (!response.ok) {
    console.warn('[NALO_SMS_ATTEMPT]', {
      attempt: 1,
      destination: normalizedPhone,
      status: response.status,
      responseText,
      authMethod,
    })

    // Attempt 2: POST form with same headers
    try {
      const bodyForm = new URLSearchParams(query)
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyForm.toString(),
      })
      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 2, destination: normalizedPhone, status: response.status, responseText, authMethod })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 2, err: String(err) })
    }
  }

  // If still not OK, try POST without Authorization header but with credentials in body
  if (!response.ok) {
    try {
      const bodyForm = new URLSearchParams(query)
      const headersNoAuth = Object.fromEntries(headers.entries())
      delete headersNoAuth['authorization']

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...headersNoAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyForm.toString(),
      })
      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 3, destination: normalizedPhone, status: response.status, responseText, authMethod: 'no-auth-header' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 3, err: String(err) })
    }
  }

  // If still not OK, try POST with JSON body (some Nalo endpoints accept JSON)
  if (!response.ok) {
    try {
      const payloadJson = {
        type,
        destination: normalizedPhone,
        dlr,
        source,
        message,
        callback_url: callbackUrl || undefined,
      }
      const headersNoAuth = Object.fromEntries(headers.entries())
      delete headersNoAuth['authorization']

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...headersNoAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadJson),
      })
      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 4, destination: normalizedPhone, status: response.status, responseText, authMethod: 'json-no-auth' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 4, err: String(err) })
    }
  }

  // Attempt 5: POST JSON with Nalo-specific body fields if the endpoint requires JSON payload
  // Derive body username/password from Basic auth token if present
  let bodyUsername = username
  let bodyPassword = password
  if (authKey && authKey.trim().toLowerCase().startsWith('basic ')) {
    try {
      const b64 = authKey.trim().slice(6).trim()
      const decoded = Buffer.from(b64, 'base64').toString('utf8')
      const idx = decoded.indexOf(':')
      if (idx !== -1) {
        bodyUsername = decoded.slice(0, idx)
        bodyPassword = decoded.slice(idx + 1)
      }
    } catch (err) {
      /* ignore decode errors */
    }
  }

  if (!response.ok) {
    try {
      const bodyJson: Record<string, unknown> = {
        msisdn: normalizedPhone,
        sender_id: source,
        message,
      }
      if (callbackUrl) bodyJson.callback_url = callbackUrl
      if (rawAuthKey && !isBasicAuthKey) bodyJson.key = rawAuthKey
      if (bodyUsername) bodyJson.username = bodyUsername
      if (bodyPassword) bodyJson.password = bodyPassword

      const headersNoAuth = Object.fromEntries(headers.entries())
      delete headersNoAuth['authorization']

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...headersNoAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyJson),
      })

      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 5, destination: normalizedPhone, status: response.status, responseText, authMethod: 'json-nalo-fields' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 5, err: String(err) })
    }
  }

  if (!response.ok) {
    try {
      const bodyForm = new URLSearchParams()
      bodyForm.set('msisdn', normalizedPhone)
      bodyForm.set('sender_id', source)
      bodyForm.set('message', message)
      // include credentials if available
      if (rawAuthKey && !isBasicAuthKey) {
        bodyForm.set('key', rawAuthKey)
      }
      if (bodyUsername) bodyForm.set('username', bodyUsername)
      if (bodyPassword) bodyForm.set('password', bodyPassword)

      // send without Authorization header (some Nalo setups expect creds in body)
      const headersNoAuth = Object.fromEntries(headers.entries())
      delete headersNoAuth['authorization']

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...headersNoAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyForm.toString(),
      })

      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 6, destination: normalizedPhone, status: response.status, responseText, authMethod: 'nalo-field-names' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 6, err: String(err) })
    }
  }

  // Attempt 7: alternate endpoint fallback for the new SMS API path
  if (!response.ok && alternateEndpoint && alternateRequestUrl) {
    try {
      response = await fetch(alternateRequestUrl, {
        method: 'GET',
        headers,
      })
      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 7, destination: normalizedPhone, status: response.status, responseText, authMethod: 'alternate-get' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 7, err: String(err) })
    }
  }

  if (!response.ok && alternateEndpoint) {
    try {
      const bodyJson: Record<string, unknown> = {
        msisdn: normalizedPhone,
        sender_id: source,
        message,
      }
      if (callbackUrl) bodyJson.callback_url = callbackUrl
      if (rawAuthKey && !isBasicAuthKey) bodyJson.key = rawAuthKey
      if (bodyUsername) bodyJson.username = bodyUsername
      if (bodyPassword) bodyJson.password = bodyPassword

      const headersNoAuth = Object.fromEntries(headers.entries())
      delete headersNoAuth['authorization']

      response = await fetch(alternateEndpoint, {
        method: 'POST',
        headers: {
          ...headersNoAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyJson),
      })
      responseText = await response.text().catch(() => '')
      normalizedResponse = String(responseText || '').trim().toLowerCase()
      console.warn('[NALO_SMS_ATTEMPT]', { attempt: 8, destination: normalizedPhone, status: response.status, responseText, authMethod: 'alternate-json' })
    } catch (err) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', { attempt: 8, err: String(err) })
    }
  }

  // Final check
  if (!response.ok) {
    console.warn('[NALO_SMS_ALL_ATTEMPTS_FAILED]', { destination: normalizedPhone, finalStatus: response.status, responseText, authMethod })
    throw new Error(`Nalo SMS send failed (${response.status}): ${responseText || 'no response body'}`)
  }

  if (normalizedResponse && /(error|failed|invalid|unauthorized|denied|rejected)/.test(normalizedResponse)) {
    throw new Error(`Nalo SMS send returned error body: ${responseText}`)
  }

  console.info('[NALO_SMS_SEND_SUCCESS]', {
    destination: normalizedPhone,
    responseStatus: response.status,
    responseText,
  })
}

async function sendUssdTicketSmsNotification(params: {
  phoneNumber: string
  reference: string
  ticketCodes: string[]
  eventTitle?: string
}) {
  const { ticketCodes, reference, eventTitle, phoneNumber } = params
  const suffix = ticketCodes.length === 1 ? 'Code' : 'Codes'
  const eventPart = eventTitle ? ` | Event: ${eventTitle}` : ''
  const message =
    `BlakVote Ticket ${suffix}: ${ticketCodes.join(', ')}${eventPart}. ` +
    `Ref: ${reference}. Show this code at the gate.`
  await sendNaloSms(phoneNumber, message)
}

async function sendUssdVoteSmsNotification(params: {
  phoneNumber: string
  reference: string
  candidateName: string
  eventTitle: string
  quantity: number
  amountPaid: number
}) {
  const { phoneNumber, reference, candidateName, eventTitle, quantity, amountPaid } = params
  const message =
    `BlakVote: Vote confirmed! You cast ${quantity} vote${quantity === 1 ? '' : 's'} for ${candidateName}` +
    ` in ${eventTitle}. Amount: GHS ${Number(amountPaid).toFixed(2)}. Ref: ${reference}. Thank you!`
  await sendNaloSms(phoneNumber, message)
}

type InitiateMoMoPaymentInput = {
  phone: string
  amount: number
  reference: string
  accountName?: string | null
  description?: string | null
}

const NALO_CONFIRMED_STATUSES = ['success', 'successful', 'succeeded', 'paid', 'completed', 'processed']
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
    process.env.SITE_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL

  const trimmed = raw?.trim()

  if (!trimmed) {
    if (process.env.NODE_ENV !== 'production') {
      return 'http://localhost:3000'
    }

    throw new Error('Invalid callback base URL')
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(normalized)
    return parsed.toString().replace(/\/$/, '')
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      return 'http://localhost:3000'
    }

    throw new Error('Invalid callback base URL')
  }
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

const NALO_DEFAULT_WEBHOOK_ALLOWED_IPS = ['135.181.194.193']

function getAllowedNaloWebhookIps() {
  return getAllowedIps(
    'NALO_WEBHOOK_ALLOWED_IPS',
    getAllowedIps('NALO_ALLOWED_IPS', NALO_DEFAULT_WEBHOOK_ALLOWED_IPS)
  )
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
    const allowedIps = getAllowedNaloWebhookIps()
    const clientIp = extractClientIp(request)

    if (!isRequestFromAllowedIps(request, allowedIps)) {
      console.warn('[NALO_WEBHOOK_BLOCKED_IP]', { clientIp, allowedIps })
      return NextResponse.json({ error: 'Unauthorized source IP' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') || ''
    const rawBody = await request.text()
    const signature =
      request.headers.get('x-nalo-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('x-webhook-signature')

    if (!isValidNaloWebhookSignature(rawBody, signature)) {
      console.warn('[NALO_WEBHOOK_INVALID_SIGNATURE]', {
        clientIp,
        hasSignature: Boolean(signature),
      })
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const payload = parseNaloWebhookPayload(rawBody, contentType)
    const verification = await paymentService.verifyPayment({
      provider: 'nalo',
      payload,
    })

    const normalizedStatus = normalizeWebhookStatus(verification.status)
    console.info('[NALO_WEBHOOK_VERIFICATION]', {
      clientIp,
      status: normalizedStatus,
      reference: verification.reference,
      amount: verification.amount,
    })

    if (NALO_CONFIRMED_STATUSES.includes(normalizedStatus)) {
      const result = await paymentService.handleSuccess(verification)

      try {
        const body = (result?.body || {}) as ProcessSuccessResultBody
        const phoneNumber = await getPaymentPhoneByReference(verification.reference)

        if (phoneNumber) {
          if (body.resource === 'ticket') {
            const ticketCodes = getTicketCodesFromResultBody(body)
            if (ticketCodes.length > 0) {
              const eventTitle = await getEventTitleById(
                typeof body.eventId === 'string' ? body.eventId : ''
              )
              await sendUssdTicketSmsNotification({
                phoneNumber,
                reference: verification.reference,
                ticketCodes,
                eventTitle: eventTitle || undefined,
              })
              console.info('[NALO_WEBHOOK_TICKET_SMS_SENT]', {
                reference: verification.reference,
                codesCount: ticketCodes.length,
              })
            }
          } else if (body.resource === 'vote' || body.voteId) {
            const voteInfo = await getVoteInfoForSms(
              typeof body.voteId === 'string' ? body.voteId : '',
              typeof body.eventId === 'string' ? body.eventId : ''
            )
            if (voteInfo) {
              await sendUssdVoteSmsNotification({
                phoneNumber,
                reference: verification.reference,
                candidateName: voteInfo.candidateName,
                eventTitle: voteInfo.eventTitle,
                quantity: voteInfo.quantity,
                amountPaid: verification.amount,
              })
              console.info('[NALO_WEBHOOK_VOTE_SMS_SENT]', {
                reference: verification.reference,
              })
            }
          }
        } else {
          console.warn('[NALO_WEBHOOK_SMS_SKIPPED_NO_PHONE]', {
            reference: verification.reference,
          })
        }
      } catch (notifyError: any) {
        console.warn('[NALO_WEBHOOK_SMS_FAIL]', {
          reference: verification.reference,
          error: notifyError?.message || String(notifyError),
        })
      }

      console.info('[NALO_WEBHOOK_CONFIRMED_RESULT]', {
        reference: verification.reference,
        status: normalizedStatus,
        responseStatus: result.status,
      })
      return NextResponse.json(result.body, { status: result.status })
    }

    if (NALO_PENDING_STATUSES.includes(normalizedStatus)) {
      await updateUssdPendingTransaction(verification.reference, {
        status: 'pending',
        gatewayStatus: normalizedStatus,
      })

      console.info('[NALO_WEBHOOK_PENDING]', {
        reference: verification.reference,
        status: normalizedStatus,
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

      console.info('[NALO_WEBHOOK_FAILED]', {
        reference: verification.reference,
        status: normalizedStatus,
      })

      return NextResponse.json(
        { received: true, status: normalizedStatus, action: 'payment_failed' },
        { status: 200 }
      )
    }

    console.warn('[NALO_WEBHOOK_IGNORED_STATUS]', {
      reference: verification.reference,
      status: normalizedStatus || 'unknown',
    })

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