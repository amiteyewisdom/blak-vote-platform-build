import { getSupabaseAdminClient } from '@/lib/server-security'

type ProcessSuccessResultBody = {
  resource?: 'vote' | 'ticket'
  eventId?: string
  voteId?: string
  ticketCode?: string | null
  ticketCodes?: string[]
  [key: string]: unknown
}

function normalizeGhanaPhone(phone: string): string {
  let p = String(phone || '').trim()
  p = p.replace(/[\s\-()]/g, '')
  if (p.startsWith('+')) {
    p = p.slice(1)
  }
  if (p.startsWith('0')) {
    p = '233' + p.slice(1)
  }
  if (!p.startsWith('233') && !p.startsWith('0') && p.length === 9) {
    p = '233' + p
  }
  return p
}

function isSmsResponseSuccessful(status: number, responseText: string) {
  if (!status || status < 200 || status >= 300) {
    return false
  }

  const normalized = String(responseText || '').trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (/(^|\b)(success|successful|sent|accepted|queued|ok)(\b|$)/.test(normalized)) {
    return true
  }

  return !/(error|failed|invalid|unauthorized|denied|rejected)/.test(normalized)
}

export async function sendNaloSms(phoneNumber: string, message: string): Promise<void> {
  const normalizedPhone = normalizeGhanaPhone(phoneNumber)
  const usernamePrefix = process.env.NALO_SMS_USERNAME_PREFIX?.trim() || 'Resl_Nalo'
  const authKey = process.env.NALO_SMS_AUTH_KEY?.trim()
  const username = process.env.NALO_SMS_USERNAME?.trim()
  const password = process.env.NALO_SMS_PASSWORD?.trim()
  const source = process.env.NALO_SMS_SOURCE?.trim() || 'BLAKVOTE'

  if (!authKey && !(username && password)) {
    console.warn('[NALO_SMS_SKIPPED_NO_AUTH]', { phoneNumber: normalizedPhone })
    return
  }

  if (!/^[0-9]{9,15}$/.test(normalizedPhone)) {
    console.warn('[NALO_SMS_SKIPPED_INVALID_PHONE]', { phoneNumber, normalizedPhone })
    return
  }

  const primaryEndpoint =
    process.env.NALO_SMS_API_URL?.trim() ||
    `https://sms.nalosolutions.com/smsbackend/${encodeURIComponent(usernamePrefix)}/send-message/`

  const legacyEndpoint = `https://sms.nalosolutions.com/smsbackend/clientapi/${encodeURIComponent(usernamePrefix)}/send-message/`

  const attempts: Array<{
    label: string
    url: string
    init: RequestInit
  }> = []

  const jsonBody: Record<string, string> = {
    msisdn: normalizedPhone,
    sender_id: source,
    message,
  }
  if (authKey) jsonBody.key = authKey
  if (username) jsonBody.username = username
  if (password) jsonBody.password = password

  attempts.push({
    label: 'post-json-primary',
    url: primaryEndpoint,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody),
    },
  })

  const legacyQuery = new URLSearchParams()
  legacyQuery.set('type', process.env.NALO_SMS_TYPE?.trim() || '0')
  legacyQuery.set('destination', normalizedPhone)
  legacyQuery.set('dlr', process.env.NALO_SMS_DLR?.trim() || '1')
  legacyQuery.set('source', source)
  legacyQuery.set('message', message)
  if (authKey) legacyQuery.set('key', authKey)
  if (username) legacyQuery.set('username', username)
  if (password) legacyQuery.set('password', password)

  attempts.push({
    label: 'get-legacy-primary',
    url: `${primaryEndpoint}?${legacyQuery.toString()}`,
    init: { method: 'GET' },
  })

  attempts.push({
    label: 'post-json-legacy-endpoint',
    url: legacyEndpoint,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody),
    },
  })

  let lastStatus = 0
  let lastResponseText = ''

  for (const [index, attempt] of attempts.entries()) {
    try {
      const response = await fetch(attempt.url, attempt.init)
      const responseText = await response.text().catch(() => '')
      lastStatus = response.status
      lastResponseText = responseText

      console.info('[NALO_SMS_ATTEMPT]', {
        attempt: index + 1,
        label: attempt.label,
        destination: normalizedPhone,
        status: response.status,
        responseText,
      })

      if (isSmsResponseSuccessful(response.status, responseText)) {
        console.info('[NALO_SMS_SEND_SUCCESS]', {
          destination: normalizedPhone,
          label: attempt.label,
          responseStatus: response.status,
          responseText,
        })
        return
      }
    } catch (error) {
      console.warn('[NALO_SMS_ATTEMPT_ERROR]', {
        attempt: index + 1,
        label: attempt.label,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.warn('[NALO_SMS_ALL_ATTEMPTS_FAILED]', {
    destination: normalizedPhone,
    finalStatus: lastStatus,
    responseText: lastResponseText,
  })
  throw new Error(`Nalo SMS send failed (${lastStatus}): ${lastResponseText || 'no response body'}`)
}

async function getEventTitleById(eventId: string): Promise<string | null> {
  if (!eventId) return null
  const supabase = getSupabaseAdminClient()
  const { data } = await supabase.from('events').select('title').eq('id', eventId).maybeSingle()
  return typeof data?.title === 'string' ? data.title : null
}

async function getPaymentPhoneByReference(reference: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('payments')
    .select('voter_phone, metadata')
    .eq('reference', reference)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const metadata = (data?.metadata as Record<string, unknown> | null) ?? null
  const candidates = [
    String(data?.voter_phone || '').trim(),
    String(metadata?.buyerPhone || '').trim(),
    String(metadata?.phone || '').trim(),
  ].filter(Boolean)

  for (const raw of candidates) {
    const normalized = normalizeGhanaPhone(raw)
    if (/^[0-9]{9,15}$/.test(normalized)) {
      return normalized
    }
  }

  return null
}

async function getVoteInfoForSms(voteId: string, eventId: string) {
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
    supabase.from('nominations').select('nominee_name').eq('id', voteRow.candidate_id).maybeSingle(),
    supabase.from('events').select('title').eq('id', effectiveEventId).maybeSingle(),
  ])

  return {
    candidateName:
      typeof nomination?.nominee_name === 'string' && nomination.nominee_name.trim()
        ? nomination.nominee_name.trim()
        : 'your candidate',
    eventTitle:
      typeof eventRow?.title === 'string' && eventRow.title.trim() ? eventRow.title.trim() : 'the event',
    quantity: Number(voteRow.quantity || 1),
  }
}

function getVoteInfoFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null

  const quantity = Number(metadata.quantity || 1)
  if (!Number.isFinite(quantity) || quantity < 1) {
    return null
  }

  return {
    candidateName: String(metadata.candidateCode || metadata.candidateId || 'your candidate'),
    eventTitle: String(metadata.eventCode || metadata.eventId || 'the event'),
    quantity,
  }
}

function getTicketCodesFromResultBody(body: ProcessSuccessResultBody | null | undefined) {
  const codes = Array.isArray(body?.ticketCodes)
    ? body.ticketCodes.filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    : []

  if (codes.length > 0) {
    return codes
  }

  if (typeof body?.ticketCode === 'string' && body.ticketCode.trim().length > 0) {
    return [body.ticketCode.trim()]
  }

  return []
}

async function fetchIssuedTicketCodesByReference(reference: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_code')
    .eq('payment_reference', reference)
    .eq('ticket_kind', 'issued')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || [])
    .map((row) => String(row.ticket_code || '').trim())
    .filter((code) => code.length > 0)
}

export async function notifyUssdPaymentSms(params: {
  reference: string
  amountPaid?: number
  resultBody: ProcessSuccessResultBody
}) {
  const { reference, resultBody } = params
  const phoneNumber = await getPaymentPhoneByReference(reference)

  if (!phoneNumber) {
    console.warn('[USSD_SMS_SKIPPED_NO_PHONE]', { reference })
    return
  }

  const supabase = getSupabaseAdminClient()
  const { data: payment } = await supabase
    .from('payments')
    .select('payment_context, event_id, vote_id, ticket_id, amount, metadata, status')
    .eq('reference', reference)
    .maybeSingle()

  if (!payment) {
    console.warn('[USSD_SMS_SKIPPED_NO_PAYMENT]', { reference })
    return
  }

  const metadata = (payment.metadata as Record<string, unknown> | null) ?? null
  const paymentContext = String(payment.payment_context || resultBody.resource || '').toLowerCase()
  const amountPaid = Number(payment.amount || params.amountPaid || 0)

  if (paymentContext === 'ticket' || resultBody.resource === 'ticket' || payment.ticket_id) {
    let ticketCodes = getTicketCodesFromResultBody(resultBody)
    if (ticketCodes.length === 0) {
      ticketCodes = await fetchIssuedTicketCodesByReference(reference)
    }

    if (ticketCodes.length === 0) {
      console.warn('[USSD_SMS_SKIPPED_NO_TICKET_CODES]', { reference })
      return
    }

    const eventTitle = await getEventTitleById(
      typeof resultBody.eventId === 'string' ? resultBody.eventId : String(payment.event_id || '')
    )

    const suffix = ticketCodes.length === 1 ? 'Code' : 'Codes'
    const eventPart = eventTitle ? ` | Event: ${eventTitle}` : ''
    const message =
      `BlakVote Ticket ${suffix}: ${ticketCodes.join(', ')}${eventPart}. ` +
      `Ref: ${reference}. Show this code at the gate.`

    await sendNaloSms(phoneNumber, message)
    console.info('[USSD_TICKET_SMS_SENT]', { reference, codesCount: ticketCodes.length })
    return
  }

  if (paymentContext === 'vote' || resultBody.resource === 'vote' || resultBody.voteId || payment.vote_id) {
    const voteId =
      typeof resultBody.voteId === 'string' && resultBody.voteId
        ? resultBody.voteId
        : String(payment.vote_id || '')

    const eventId =
      typeof resultBody.eventId === 'string' ? resultBody.eventId : String(payment.event_id || '')

    const voteInfo = (await getVoteInfoForSms(voteId, eventId)) || getVoteInfoFromMetadata(metadata)

    if (!voteInfo) {
      console.warn('[USSD_SMS_SKIPPED_NO_VOTE_INFO]', { reference, voteId })
      return
    }

    const message =
      `BlakVote: Vote confirmed! You cast ${voteInfo.quantity} vote${voteInfo.quantity === 1 ? '' : 's'} for ${voteInfo.candidateName}` +
      ` in ${voteInfo.eventTitle}. Amount: GHS ${amountPaid.toFixed(2)}. Ref: ${reference}. Thank you!`

    await sendNaloSms(phoneNumber, message)
    console.info('[USSD_VOTE_SMS_SENT]', { reference, voteId: voteId || null })
  }
}
