import crypto from 'crypto'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { isVotingOpenStatus } from '@/lib/event-status'
import { extractClientIp, getAllowedIps, getSupabaseAdminClient, isRequestFromAllowedIps } from '@/lib/server-security'
import { sendNaloSms } from '@/lib/ussd-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type NormalizedUssdRequest = {
  sessionId: string
  phoneNumber: string
  text: string
}

type GenericInput = Record<string, unknown>

type EventRecord = {
  id: string
  organizer_id?: string | null
  title?: string | null
  short_code?: string | null
  event_code?: string | null
  status?: string | null
  vote_price?: number | string | null
  cost_per_vote?: number | string | null
  voting_fee?: number | string | null
}

type TicketPlanRecord = {
  id: string
  event_id: string
  name?: string | null
  price?: number | string | null
  quantity?: number | string | null
  sold_count?: number | string | null
}

type UssdSessionRecord = {
  session_id: string
  phone_number?: string | null
  steps?: unknown
}

type CandidateRecord = {
  id: string
  nominee_name?: string | null
  event_id: string
  voting_code?: string | null
  short_code?: string | null
  status?: string | null
}

const MAX_VOTE_QUANTITY = 1000
const NALO_DEFAULT_USSD_ALLOWED_IPS = ['136.243.56.160']
const DEFAULT_USSD_SHORTCODE = '*920*377#'

type UssdResponseMode = 'plain-text' | 'nalo-json'

function getAllowedUssdIps() {
  return getAllowedIps('NALO_USSD_ALLOWED_IPS', NALO_DEFAULT_USSD_ALLOWED_IPS)
}

function trimToPhoneIdentifier(phone: string) {
  return String(phone || '').trim().slice(0, 20)
}

function formatPhoneForSms(phone: string): string {
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
  // If it doesn't have country code, assume it's 233
  if (!p.startsWith('233') && !p.startsWith('0') && p.length === 9) {
    p = '233' + p
  }
  return p
}

function toUpperCode(value: string) {
  return String(value || '').trim().toUpperCase()
}

function toLowerCaseKeys(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value])
  ) as Record<string, unknown>
}

function readInputString(raw: Record<string, unknown>, keys: string[]) {
  const lowered = toLowerCaseKeys(raw)

  for (const key of keys) {
    const value = lowered[key.toLowerCase()]
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim()
    }
  }

  return ''
}

function detectUssdResponseMode(contentType: string, parsedInput: Record<string, unknown>): UssdResponseMode {
  const keys = Object.keys(toLowerCaseKeys(parsedInput))
  const hasNaloJsonMarkers = ['userdata', 'msgtype', 'msisdn', 'userid'].some((key) =>
    keys.includes(key)
  )

  if (contentType.includes('application/json') && hasNaloJsonMarkers) {
    return 'nalo-json'
  }

  return 'plain-text'
}

async function adaptUssdResponse(
  response: Response,
  mode: UssdResponseMode,
  parsedInput: Record<string, unknown>
) {
  if (mode === 'plain-text') {
    return response
  }

  const raw = await response.text()
  const isContinue = raw.startsWith('CON ')
  const message = raw.startsWith('CON ') || raw.startsWith('END ') ? raw.slice(4) : raw

  const payload: Record<string, unknown> = {
    USERID: readInputString(parsedInput, ['userid', 'user_id', 'clientid', 'client_id']),
    MSISDN: readInputString(parsedInput, ['msisdn', 'phonenumber', 'phone', 'mobilenumber']),
    SESSIONID: readInputString(parsedInput, ['sessionid', 'session_id', 'clientsessionid']),
    NETWORK: readInputString(parsedInput, ['network']),
    USERDATA: message,
    MSG: message,
    MSGTYPE: isContinue,
  }

  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function con(message: string) {
  const body = `CON ${message}`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-USSD-FLOW-STATE': 'CON',
    },
  })
}

function end(message: string) {
  const body = `END ${message}`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-USSD-FLOW-STATE': 'END',
    },
  })
}

function normalizeBody(raw: Record<string, unknown>): NormalizedUssdRequest {
  const lowered = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value])
  )

  const readString = (keys: string[]) => {
    for (const key of keys) {
      const value = lowered[key.toLowerCase()]
      if (value != null && String(value).trim().length > 0) {
        return String(value).trim()
      }
    }

    return ''
  }

  // Includes common Nalo aliases (sessionid, userid, msisdn, msg, message).
  const sessionId =
    readString(['sessionid', 'session_id', 'userid', 'clientsessionid']) ||
    crypto.randomUUID()

  const phoneNumber = readString(['phonenumber', 'phone', 'msisdn', 'mobilenumber'])

  const text = readString(['text', 'input', 'msg', 'message', 'ussdstring', 'userdata'])

  return { sessionId, phoneNumber, text }
}

function parseMenu(text: string) {
  const rawText = String(text || '').trim()
  if (!rawText) {
    return [] as string[]
  }

  const configuredShortcode =
    process.env.NALO_USSD_SHORTCODE?.trim() || process.env.USSD_SHORTCODE?.trim() || DEFAULT_USSD_SHORTCODE

  const normalizedShortcode = configuredShortcode
    .replace(/^[#*\s]+/g, '')
    .replace(/[#*\s]+$/g, '')

  let normalizedText = rawText.replace(/^[#*\s]+/g, '')

  if (normalizedShortcode && normalizedText.startsWith(normalizedShortcode)) {
    normalizedText = normalizedText.slice(normalizedShortcode.length)
  }

  normalizedText = normalizedText.replace(/^[#*\s]+/g, '').replace(/[#*\s]+$/g, '')

  const menuTokens = normalizedText
    .split('*')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  return menuTokens
}

function normalizeMenuToken(token: string) {
  return String(token || '').trim().replace(/^[#*\s]+/g, '').replace(/[#*\s]+$/g, '')
}

function normalizeStoredSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value
    .map((step) => normalizeMenuToken(String(step || '')))
    .filter((step) => step.length > 0)
}

function deriveSessionSteps(currentSteps: string[], storedSteps: string[]) {
  const cleanCurrent = currentSteps.map((step) => normalizeMenuToken(step)).filter((step) => step.length > 0)
  const cleanStored = storedSteps.map((step) => normalizeMenuToken(step)).filter((step) => step.length > 0)

  if (cleanCurrent.length === 0) {
    return [] as string[]
  }

  // Some gateways provide cumulative path, e.g. 1*337*ABC.
  if (cleanCurrent.length > 1) {
    return cleanCurrent
  }

  const inputToken = cleanCurrent[0]
  if (!inputToken) {
    return cleanStored
  }

  if (cleanStored.length === 0) {
    return [inputToken]
  }

  return [...cleanStored, inputToken]
}

function readUssdFlowState(response: Response) {
  return response.headers.get('X-USSD-FLOW-STATE') === 'CON' ? 'CON' : 'END'
}

function isMissingUssdSessionTableError(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('relation') && message.includes('ussd_sessions') && message.includes('does not exist')
}

async function loadUssdSessionRecord(sessionId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('ussd_sessions')
    .select('session_id, phone_number, steps')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) {
    if (!isMissingUssdSessionTableError(error)) {
      console.error('[USSD_SESSION_LOAD_FAIL]', error.message)
    }

    return null
  }

  return (data || null) as UssdSessionRecord | null
}

async function saveUssdSessionRecord(params: {
  sessionId: string
  phoneNumber: string
  steps: string[]
}) {
  const { sessionId, phoneNumber, steps } = params
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('ussd_sessions').upsert(
    {
      session_id: sessionId,
      phone_number: phoneNumber || null,
      steps,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'session_id',
    }
  )

  if (error && !isMissingUssdSessionTableError(error)) {
    console.error('[USSD_SESSION_SAVE_FAIL]', error.message)
  }
}

async function clearUssdSessionRecord(sessionId: string) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('ussd_sessions').delete().eq('session_id', sessionId)

  if (error && !isMissingUssdSessionTableError(error)) {
    console.error('[USSD_SESSION_CLEAR_FAIL]', error.message)
  }
}

async function getNaloPaymentUtils() {
  return import('@/lib/nalo-payment')
}

function stripSignaturePrefix(signature: string) {
  return signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature
}

function isValidUssdSignature(rawBody: string, signature: string | null) {
  const secret = process.env.USSD_WEBHOOK_SECRET
  if (!secret) {
    return true
  }

  if (!signature) {
    return false
  }

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    const receivedBuffer = Buffer.from(stripSignaturePrefix(signature.trim()), 'hex')

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  } catch {
    return false
  }
}

async function getEventByCode(code: string): Promise<EventRecord | null> {
  const supabase = getSupabaseAdminClient()
  const normalizedCode = toUpperCode(code)

  const [byEventCode, byShortCode] = await Promise.all([
    supabase.from('events').select('*').ilike('event_code', normalizedCode).maybeSingle(),
    supabase.from('events').select('*').ilike('short_code', normalizedCode).maybeSingle(),
  ])

  return (byEventCode.data || byShortCode.data || null) as EventRecord | null
}

async function getEventById(id: string): Promise<EventRecord | null> {
  const supabase = getSupabaseAdminClient()
  const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
  return (data || null) as EventRecord | null
}

function isMultipleRowsError(error: any) {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()
  return code === 'pgrst116' || message.includes('multiple') || message.includes('more than 1 row')
}

async function findCandidateByCode(code: string): Promise<{ candidate: CandidateRecord | null; ambiguous: boolean }> {
  const supabase = getSupabaseAdminClient()
  const normalizedCode = toUpperCode(code)

  const [byVotingCode, byShortCode] = await Promise.all([
    supabase
      .from('nominations')
      .select('id, nominee_name, event_id, voting_code, short_code, status')
      .ilike('voting_code', normalizedCode)
      .maybeSingle(),
    supabase
      .from('nominations')
      .select('id, nominee_name, event_id, voting_code, short_code, status')
      .ilike('short_code', normalizedCode)
      .maybeSingle(),
  ])

  if (isMultipleRowsError(byVotingCode.error) || isMultipleRowsError(byShortCode.error)) {
    return { candidate: null, ambiguous: true }
  }

  return {
    candidate: (byVotingCode.data || byShortCode.data || null) as CandidateRecord | null,
    ambiguous: false,
  }
}

async function getTicketPlansForEvent(eventId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tickets')
    .select('id, event_id, name, price, quantity, sold_count, admin_fee, created_at')
    .eq('event_id', eventId)
    .or('ticket_kind.eq.plan,and(ticket_kind.is.null,parent_ticket_id.is.null,payment_reference.is.null)')
    .order('price', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || [])
    .map((plan) => {
      const totalQuantity = Math.max(1, Number(plan.quantity || 1))
      const soldCount = Math.max(0, Number(plan.sold_count || 0))
      const remainingQuantity = Math.max(totalQuantity - soldCount, 0)

      return {
        id: plan.id,
        event_id: plan.event_id,
        name: plan.name,
        price: Number(plan.price || 0),
        remainingQuantity,
      }
    })
    .filter((plan) => plan.remainingQuantity > 0)
}

async function issueFreeTickets(params: {
  planId: string
  buyerName: string
  buyerPhone: string
  quantity: number
}) {
  const { planId, buyerName, buyerPhone, quantity } = params
  const supabase = getSupabaseAdminClient()
  const syntheticEmail = `ussd+${trimToPhoneIdentifier(buyerPhone)}@blakvote.local`

  const { data: issuedTickets, error: issueError } = await supabase.rpc('issue_ticket_purchase', {
    p_plan_id: planId,
    p_payment_reference: null,
    p_buyer_name: buyerName,
    p_buyer_email: syntheticEmail,
    p_buyer_phone: buyerPhone,
    p_quantity: quantity,
  })

  if (issueError) {
    return { ok: false as const, error: issueError.message }
  }

  const ticketCodes = (issuedTickets || []).map((ticket: { ticket_code: string }) => ticket.ticket_code)

  if (ticketCodes.length === 0) {
    return { ok: false as const, error: 'No ticket code was issued' }
  }

  return {
    ok: true as const,
    ticketCodes,
  }
}

type UssdBulkVotePackage = {
  id: string
  votes_included: number
  price_per_package: number
  description?: string | null
}

async function getBulkVotePackagesForEvent(eventId: string): Promise<UssdBulkVotePackage[]> {
  const supabase = getSupabaseAdminClient()

  let data: any[] | null = null
  let error: { message: string } | null = null

  const primaryResult = await supabase
    .from('bulk_vote_packages')
    .select('id, votes_included, price_per_package, description, is_active')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('votes_included', { ascending: true })

  data = primaryResult.data
  error = primaryResult.error

  if (error && /is_active/i.test(error.message)) {
    const fallbackResult = await supabase
      .from('bulk_vote_packages')
      .select('id, votes_included, price_per_package, description')
      .eq('event_id', eventId)
      .order('votes_included', { ascending: true })

    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    console.error('[USSD_BULK_PACKAGES_FAIL]', error.message)
    return []
  }

  return (data || [])
    .map((pkg: any) => ({
      id: String(pkg.id),
      votes_included: Math.max(1, Number(pkg.votes_included || 1)),
      price_per_package: Number(pkg.price_per_package || 0),
      description: pkg.description ?? null,
    }))
    .filter((pkg) => pkg.votes_included > 1 && pkg.price_per_package > 0)
}

async function processUssdVotePayment(params: {
  sessionId: string
  phoneNumber: string
  event: EventRecord
  candidate: CandidateRecord
  candidateCode: string
  quantity: number
  amount: number
  bulkPackageId?: string | null
}) {
  const { sessionId, phoneNumber, event, candidate, candidateCode, quantity, amount, bulkPackageId } = params

  if (!phoneNumber) {
    return end('Unable to read your phone number from network. Please try again.')
  }

  const {
    buildUssdTransactionId,
    createOrReuseUssdPendingTransaction,
    initiateMoMoPayment,
    updateUssdPendingTransaction,
  } = await getNaloPaymentUtils()

  const eventCode = toUpperCode(String(event?.short_code || event?.event_code || event?.id || ''))
  const transactionId = buildUssdTransactionId(
    `USSD:${sessionId}:${event.id}:${candidate.id}:${quantity}:${amount}:${trimToPhoneIdentifier(phoneNumber)}`
  )

  if (amount <= 0) {
    const supabase = getSupabaseAdminClient()

    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (existingVote?.id) {
      return end('Vote already recorded for this USSD session.')
    }

    const { error: rpcError } = await supabase.rpc('process_vote', {
      p_event_id: event.id,
      p_candidate_id: candidate.id,
      p_quantity: quantity,
      p_voter_id: null,
      p_voter_phone: trimToPhoneIdentifier(phoneNumber),
      p_vote_source: 'ussd',
      p_payment_method: 'ussd',
      p_transaction_id: transactionId,
      p_ip_address: null,
      p_amount_paid: 0,
    })

    if (rpcError) {
      console.error('[USSD_VOTE_FAIL]', rpcError.message)
      return end('Unable to record vote right now. Please try again.')
    }

    try {
      const smsMsgFree =
        `BlakVote: Vote confirmed! You cast ${quantity} vote${quantity === 1 ? '' : 's'} for ` +
        `${candidate.nominee_name || candidateCode} in ${event.title || eventCode}. ` +
        `Amount: GHS 0.00. Thank you!`
      await sendNaloSms(formatPhoneForSms(phoneNumber), smsMsgFree)
    } catch (smsErr: any) {
      console.warn('[USSD_FREE_VOTE_SMS_FAIL]', smsErr?.message || smsErr)
    }

    return end('Vote recorded successfully. Thank you for voting!')
  }

  try {
    const transaction = await createOrReuseUssdPendingTransaction({
      id: transactionId,
      phoneNumber,
      eventId: event.id,
      organizerId: event.organizer_id ?? null,
      eventCode,
      candidateId: candidate.id,
      candidateCode,
      quantity,
      type: 'vote',
      amount,
      bulkPackageId: bulkPackageId ?? null,
    })

    if (transaction.status === 'paid') {
      return end('Payment already confirmed for this request.')
    }

    if (transaction.status === 'pending' && transaction.gatewayStatus === 'payment_request_sent') {
      return end('Payment request sent. Please confirm on your phone.')
    }

    if (transaction.status === 'failed') {
      await updateUssdPendingTransaction(transaction.id, {
        status: 'pending',
        gatewayStatus: 'initialized',
      })
    }

    await initiateMoMoPayment({
      phone: phoneNumber,
      amount,
      reference: transaction.id,
    })

    await updateUssdPendingTransaction(transaction.id, {
      gatewayStatus: 'payment_request_sent',
    })

    return end('Payment request sent. Please confirm on your phone.')
  } catch (error: any) {
    console.error('[USSD_VOTE_PAYMENT_FAIL]', error?.message || error)

    try {
      await updateUssdPendingTransaction(transactionId, {
        status: 'failed',
        gatewayStatus: 'payment_request_failed',
      })
    } catch (updateError: any) {
      console.error('[USSD_VOTE_PAYMENT_STATUS_FAIL]', updateError?.message || updateError)
    }

    return end('Unable to start payment right now. Please try again.')
  }
}

async function handleVoteFlow(params: {
  steps: string[]
  sessionId: string
  phoneNumber: string
}) {
  const { sessionId, phoneNumber } = params
  const rawSteps = params.steps

  if (rawSteps.length === 1) {
    return con('Enter nominee code')
  }

  const candidateCode = toUpperCode(rawSteps[1])
  const candidateMatch = await findCandidateByCode(candidateCode)

  if (candidateMatch.ambiguous) {
    return end('This nominee code matches multiple events. Use a unique nominee code and try again.')
  }

  const candidate = candidateMatch.candidate

  if (!candidate) {
    return end('Candidate not found. Check nominee code and try again.')
  }

  if (!['approved', 'candidate'].includes(String(candidate.status || '').toLowerCase())) {
    return end('Candidate is not available for voting.')
  }

  const event = await getEventById(candidate.event_id)
  const eventCode = toUpperCode(String(event?.short_code || event?.event_code || event?.id || ''))

  if (!event) {
    return end('Event not found for this nominee code.')
  }

  if (!isVotingOpenStatus(event.status)) {
    return end('Voting is closed for this event.')
  }

  const bulkPackages = await getBulkVotePackagesForEvent(event.id)
  const hasBulkPackages = bulkPackages.length > 0

  if (rawSteps.length === 2) {
    if (!hasBulkPackages) {
      return con(
        `Candidate: ${candidate.nominee_name || candidateCode}\n` +
          `Event: ${event.title || eventCode}\n` +
          `Enter quantity (1-${MAX_VOTE_QUANTITY})`
      )
    }

    return con(
      `Candidate: ${candidate.nominee_name || candidateCode}\n` +
        `Event: ${event.title || eventCode}\n` +
        `1. Single vote purchase\n2. Bulk vote packages`
    )
  }

  // When no bulk packages are configured, the prompt at rawSteps.length === 2 asked for quantity
  // directly, so rawSteps[2] is the quantity. Normalize the path to match the single-vote branch.
  const steps = hasBulkPackages
    ? rawSteps
    : ['1', candidateCode, '1', ...rawSteps.slice(2)]

  const mode = steps[2]

  if (mode === '1') {
    if (steps.length === 3) {
      return con(
        `Candidate: ${candidate.nominee_name || candidateCode}\n` +
          `Event: ${event.title || eventCode}\n` +
          `Enter quantity (1-${MAX_VOTE_QUANTITY})`
      )
    }

    const quantity = Number(steps[3])
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_VOTE_QUANTITY) {
      return end(`Invalid quantity. Use a number between 1 and ${MAX_VOTE_QUANTITY}.`)
    }

    const votePrice = resolveEventVotePrice(event)
    const totalAmount = Number((votePrice * quantity).toFixed(2))

    if (steps.length === 4) {
      return con(
        `Vote ${quantity} for ${candidate.nominee_name || candidateCode}\n` +
          `Event: ${event.title || eventCode}\n` +
          `Amount: GHS ${totalAmount.toFixed(2)}\n` +
          '1. Confirm\n2. Cancel'
      )
    }

    if (steps[4] === '2') {
      return end('Vote cancelled.')
    }

    if (steps[4] !== '1') {
      return end('Invalid confirmation option.')
    }

    return processUssdVotePayment({
      sessionId,
      phoneNumber,
      event,
      candidate,
      candidateCode,
      quantity,
      amount: totalAmount,
    })
  }

  if (mode === '2') {
    if (!hasBulkPackages) {
      return end('No bulk vote packages are available for this event.')
    }

    if (steps.length === 3) {
      const menu = bulkPackages
        .slice(0, 8)
        .map(
          (pkg, index) =>
            `${index + 1}. ${pkg.votes_included} votes - GHS ${pkg.price_per_package.toFixed(2)}`
        )
        .join('\n')

      return con(
        `Candidate: ${candidate.nominee_name || candidateCode}\n` +
          `Event: ${event.title || eventCode}\n` +
          `Select bulk package\n${menu}\n0. Cancel`
      )
    }

    if (steps[3] === '0') {
      return end('Bulk vote cancelled.')
    }

    const packageIndex = Number(steps[3]) - 1
    if (!Number.isInteger(packageIndex) || packageIndex < 0 || packageIndex >= bulkPackages.length) {
      return end('Invalid package option selected.')
    }

    const selectedPackage = bulkPackages[packageIndex]
    const packageVotes = selectedPackage.votes_included
    const packageAmount = Number(selectedPackage.price_per_package.toFixed(2))

    if (steps.length === 4) {
      return con(
        `Bulk vote: ${packageVotes} votes for ${candidate.nominee_name || candidateCode}\n` +
          `Event: ${event.title || eventCode}\n` +
          `Amount: GHS ${packageAmount.toFixed(2)}\n` +
          '1. Confirm\n2. Cancel'
      )
    }

    if (steps[4] === '2') {
      return end('Bulk vote cancelled.')
    }

    if (steps[4] !== '1') {
      return end('Invalid confirmation option.')
    }

    return processUssdVotePayment({
      sessionId,
      phoneNumber,
      event,
      candidate,
      candidateCode,
      quantity: packageVotes,
      amount: packageAmount,
      bulkPackageId: selectedPackage.id,
    })
  }

  return end('Invalid option. Choose 1 for single votes or 2 for bulk vote packages.')
}

async function handleTicketFlow(params: {
  steps: string[]
  sessionId: string
  phoneNumber: string
}) {
  const { steps, sessionId, phoneNumber } = params

  if (steps.length === 1) {
    return con('Enter event code (e.g. 337)')
  }

  const eventCode = toUpperCode(steps[1])
  const event = await getEventByCode(eventCode)

  if (!event) {
    return end('Event not found. Check code and try again.')
  }

  let plans
  try {
    plans = await getTicketPlansForEvent(event.id)
  } catch (error: any) {
    console.error('[USSD_TICKET_PLAN_FAIL]', error?.message || error)
    return end('Unable to load ticket plans right now.')
  }

  if (plans.length === 0) {
    return end('No tickets are available for this event.')
  }

  if (steps.length === 2) {
    const menu = plans
      .slice(0, 6)
      .map((plan, index) => `${index + 1}. ${plan.name || 'Ticket'} GHS ${Number(plan.price || 0).toFixed(2)}`)
      .join('\n')

    return con(`Event: ${event.title || eventCode}\nSelect ticket\n${menu}`)
  }

  const planIndex = Number(steps[2]) - 1
  if (!Number.isInteger(planIndex) || planIndex < 0 || planIndex >= Math.min(plans.length, 6)) {
    return end('Invalid ticket option selected.')
  }

  const plan = plans[planIndex] as TicketPlanRecord & { price: number; remainingQuantity: number }

  if (steps.length === 3) {
    return con(`Ticket: ${plan.name || 'Ticket'}\nEnter quantity`) 
  }

  const quantity = Number(steps[3])

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > plan.remainingQuantity) {
    return end(`Invalid quantity. Enter a number greater than zero and no more than available stock.`)
  }

  const totalAmount = Number((Number(plan.price || 0) * quantity).toFixed(2))

  if (steps.length === 4) {
    return con('Enter your name')
  }

  const buyerName = String(steps[4] || '').trim()
  if (buyerName.length < 2) {
    return end('Enter a valid name with at least 2 characters.')
  }

  if (steps.length === 5) {
    const ticketLabel = quantity === 1 ? 'Ticket' : 'Tickets'
    return con(
      `${ticketLabel} x${quantity}\n` +
        `Event: ${event.title || eventCode}\n` +
        `Ticket: ${plan.name || 'Ticket'}\n` +
        `Amount: GHS ${totalAmount.toFixed(2)}\n` +
        '1. Confirm\n2. Cancel'
    )
  }

  if (steps[5] === '2') {
    return end('Ticket request cancelled.')
  }

  if (steps[5] !== '1') {
    return end('Invalid confirmation option.')
  }

  if (!phoneNumber) {
    return end('Unable to read your phone number from network. Please try again.')
  }

  const {
    buildUssdTransactionId,
    createOrReuseUssdPendingTransaction,
    initiateMoMoPayment,
    updateUssdPendingTransaction,
  } = await getNaloPaymentUtils()

  if (totalAmount <= 0) {
    const issued = await issueFreeTickets({
      planId: plan.id,
      buyerName,
      buyerPhone: trimToPhoneIdentifier(phoneNumber),
      quantity,
    })

    if (!issued.ok) {
      console.error('[USSD_TICKET_ISSUE_FAIL]', issued.error)
      return end('Unable to issue ticket right now. Please try again.')
    }

    try {
      const codeLabel = issued.ticketCodes.length === 1 ? 'Code' : 'Codes'
      const smsMsgTicket =
        `BlakVote Ticket ${codeLabel}: ${issued.ticketCodes.join(', ')}` +
        ` | Event: ${event.title || eventCode}. Show this code at the gate.`
      await sendNaloSms(formatPhoneForSms(phoneNumber), smsMsgTicket)
    } catch (smsErr: any) {
      console.warn('[USSD_FREE_TICKET_SMS_FAIL]', smsErr?.message || smsErr)
    }

    return end(`Ticket issued. Code${issued.ticketCodes.length === 1 ? '' : 's'}: ${issued.ticketCodes.join(', ')}`)
  }

  const transactionId = buildUssdTransactionId(
    `USSD:${sessionId}:${event.id}:${plan.id}:${quantity}:${buyerName}:${trimToPhoneIdentifier(phoneNumber)}`
  )

  try {
    const transaction = await createOrReuseUssdPendingTransaction({
      id: transactionId,
      phoneNumber,
      eventId: event.id,
      organizerId: event.organizer_id ?? null,
      eventCode,
      planId: plan.id,
      planName: plan.name || null,
      planOptionNumber: planIndex + 1,
      quantity,
      type: 'ticket',
      amount: totalAmount,
      buyerName,
    })

    if (transaction.status === 'paid') {
      return end('Payment already confirmed for this request.')
    }

    if (transaction.status === 'pending' && transaction.gatewayStatus === 'payment_request_sent') {
      return end('Payment request sent. Please confirm on your phone.')
    }

    if (transaction.status === 'failed') {
      await updateUssdPendingTransaction(transaction.id, {
        status: 'pending',
        gatewayStatus: 'initialized',
      })
    }

    await initiateMoMoPayment({
      phone: phoneNumber,
      amount: totalAmount,
      reference: transaction.id,
    })

    await updateUssdPendingTransaction(transaction.id, {
      gatewayStatus: 'payment_request_sent',
    })

    return end('Payment request sent. Please confirm on your phone.')
  } catch (error: any) {
    console.error('[USSD_TICKET_PAYMENT_FAIL]', error?.message || error)

    try {
      await updateUssdPendingTransaction(transactionId, {
        status: 'failed',
        gatewayStatus: 'payment_request_failed',
      })
    } catch (updateError: any) {
      console.error('[USSD_TICKET_PAYMENT_STATUS_FAIL]', updateError?.message || updateError)
    }

    return end('Unable to start payment right now. Please try again.')
  }
}

export async function POST(request: Request) {
  return handleUssdRequest(request)
}

export async function GET(request: Request) {
  return handleUssdRequest(request)
}

async function handleUssdRequest(request: Request) {
  try {
    const ussdDebugEnabled = process.env.USSD_DEBUG_LOGS === 'true'
    const ussdSafeModeEnabled = process.env.USSD_SAFE_MODE === 'true'
    const ussdDisableIpCheck = process.env.USSD_DISABLE_IP_CHECK === 'true'

    if (ussdSafeModeEnabled) {
      if (ussdDebugEnabled) {
        console.info('[USSD_DEBUG_SAFE_MODE]', {
          method: request.method,
          url: request.url,
        })
      }

      return con('Welcome to BlakVote\n1. Vote\n2. Ticketing')
    }

    const allowedIps = getAllowedUssdIps()
    const clientIp = extractClientIp(request)

    if (ussdDebugEnabled) {
      console.info('[USSD_DEBUG_REQUEST]', {
        method: request.method,
        url: request.url,
        clientIp,
        contentType: request.headers.get('content-type') || null,
        hasSignatureHeader: Boolean(
          request.headers.get('x-ussd-signature') ||
            request.headers.get('x-signature') ||
            request.headers.get('x-webhook-signature')
        ),
        allowedIps,
      })
    }

    if (!ussdDisableIpCheck && !isRequestFromAllowedIps(request, allowedIps)) {
      console.warn('[USSD_ROUTE_BLOCKED_IP]', {
        clientIp,
        allowedIps,
      })
      return end('Unauthorized source IP')
    }

    if (ussdDisableIpCheck && ussdDebugEnabled) {
      console.warn('[USSD_DEBUG_IP_CHECK_DISABLED]', { clientIp, allowedIps })
    }

    const contentType = request.headers.get('content-type') || ''
    let parsedInput: GenericInput = {}
    let rawBody = ''

    if (request.method === 'GET') {
      const url = new URL(request.url)
      parsedInput = Object.fromEntries(url.searchParams.entries())
      rawBody = url.searchParams.toString()
    } else if (contentType.includes('application/json')) {
      rawBody = await request.text()
      parsedInput = rawBody ? JSON.parse(rawBody) : {}
    } else {
      rawBody = await request.text()
      const params = new URLSearchParams(rawBody)
      parsedInput = Object.fromEntries(params.entries())
    }

    if (ussdDebugEnabled) {
      console.info('[USSD_DEBUG_PARSED_INPUT]', {
        rawBodyLength: rawBody.length,
        parsedKeys: Object.keys(parsedInput),
      })
    }

    const responseMode = detectUssdResponseMode(contentType, parsedInput)

    const signature =
      request.headers.get('x-ussd-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('x-webhook-signature')

    if (!isValidUssdSignature(rawBody, signature)) {
      return adaptUssdResponse(end('Invalid USSD signature'), responseMode, parsedInput)
    }

    const { sessionId, phoneNumber, text } = normalizeBody(parsedInput)

    if (ussdDebugEnabled) {
      console.info('[USSD_DEBUG_NORMALIZED]', {
        sessionIdPresent: Boolean(sessionId),
        phonePresent: Boolean(phoneNumber),
        text,
      })
    }

    const parsedSteps = parseMenu(text)
    const storedSession = await loadUssdSessionRecord(sessionId)
    const storedSteps = normalizeStoredSteps(storedSession?.steps)
    const steps = deriveSessionSteps(parsedSteps, storedSteps)

    if (ussdDebugEnabled) {
      console.info('[USSD_DEBUG_PARSED_STEPS]', {
        text,
        parsedSteps,
        storedSteps,
        derivedSteps: steps,
      })
    }

    let flowResponse: Response

    if (steps.length === 0) {
      flowResponse = con('Welcome to BlakVote\n1. Vote\n2. Ticketing')
    } else if (steps[0] === '1') {
      flowResponse = await handleVoteFlow({ steps, sessionId, phoneNumber })
    } else if (steps[0] === '2') {
      flowResponse = await handleTicketFlow({ steps, sessionId, phoneNumber })
    } else {
      flowResponse = end('Invalid option. Dial again and choose 1 for vote or 2 for ticketing.')
    }

    if (readUssdFlowState(flowResponse) === 'CON') {
      await saveUssdSessionRecord({ sessionId, phoneNumber, steps })
    } else {
      await clearUssdSessionRecord(sessionId)
    }

    return adaptUssdResponse(flowResponse, responseMode, parsedInput)
  } catch (error: any) {
    console.error('[USSD_ROUTE_ERROR]', error?.message || error)
    return end('Service temporarily unavailable. Please try again.')
  }
}
