import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { isVotingOpenStatus } from '@/lib/event-status'
import {
  buildUssdTransactionId,
  createOrReuseUssdPendingTransaction,
  initiateMoMoPayment,
  updateUssdPendingTransaction,
} from '@/lib/nalo-payment'
import { getSupabaseAdminClient } from '@/lib/server-security'

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

const MAX_VOTE_QUANTITY = 50
const MAX_USSD_TICKET_QUANTITY = 3

function trimToPhoneIdentifier(phone: string) {
  return String(phone || '').trim().slice(0, 20)
}

function toUpperCode(value: string) {
  return String(value || '').trim().toUpperCase()
}

function con(message: string) {
  return new NextResponse(`CON ${message}`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function end(message: string) {
  return new NextResponse(`END ${message}`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
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

  const text = readString(['text', 'input', 'msg', 'message', 'ussdstring'])

  return { sessionId, phoneNumber, text }
}

function parseMenu(text: string) {
  if (!text) {
    return [] as string[]
  }

  return text
    .split('*')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function isValidUssdSignature(rawBody: string, signature: string | null) {
  const secret = process.env.USSD_WEBHOOK_SECRET
  if (!secret) {
    return true
  }

  if (!signature) {
    return false
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const receivedBuffer = Buffer.from(signature, 'hex')

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
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

async function getCandidateByCode(eventId: string, code: string) {
  const supabase = getSupabaseAdminClient()
  const normalizedCode = toUpperCode(code)

  const [byVotingCode, byShortCode] = await Promise.all([
    supabase
      .from('nominations')
      .select('id, nominee_name, event_id, voting_code, short_code, status')
      .eq('event_id', eventId)
      .ilike('voting_code', normalizedCode)
      .maybeSingle(),
    supabase
      .from('nominations')
      .select('id, nominee_name, event_id, voting_code, short_code, status')
      .eq('event_id', eventId)
      .ilike('short_code', normalizedCode)
      .maybeSingle(),
  ])

  const candidate = byVotingCode.data || byShortCode.data
  if (!candidate) {
    return null
  }

  if (!['approved', 'candidate'].includes(String(candidate.status || '').toLowerCase())) {
    return null
  }

  return candidate
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

async function handleVoteFlow(params: {
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

  if (!isVotingOpenStatus(event.status)) {
    return end('Voting is closed for this event.')
  }

  if (steps.length === 2) {
    return con(`Event: ${event.title || eventCode}\nEnter candidate code`)
  }

  const candidateCode = toUpperCode(steps[2])
  const candidate = await getCandidateByCode(event.id, candidateCode)

  if (!candidate) {
    return end('Candidate not found for this event.')
  }

  if (steps.length === 3) {
    return con('Enter quantity (1-50)')
  }

  const quantity = Number(steps[3])
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_VOTE_QUANTITY) {
    return end('Invalid quantity. Use a number between 1 and 50.')
  }

  const votePrice = resolveEventVotePrice(event)
  const totalAmount = Number((votePrice * quantity).toFixed(2))

  if (steps.length === 4) {
    return con(
      `Vote ${quantity} for ${candidate.nominee_name || 'candidate'}\n` +
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

  const transactionId = buildUssdTransactionId(
    `USSD:${sessionId}:${event.id}:${candidate.id}:${quantity}:${trimToPhoneIdentifier(phoneNumber)}`
  )

  if (totalAmount <= 0) {
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
      p_amount_paid: totalAmount,
    })

    if (rpcError) {
      console.error('[USSD_VOTE_FAIL]', rpcError.message)
      return end('Unable to record vote right now. Please try again.')
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
      amount: totalAmount,
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
    return con(`Ticket: ${plan.name || 'Ticket'}\nEnter quantity (1-${Math.min(plan.remainingQuantity, MAX_USSD_TICKET_QUANTITY)})`)
  }

  const quantity = Number(steps[3])
  const maxAllowedQuantity = Math.min(plan.remainingQuantity, MAX_USSD_TICKET_QUANTITY)

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxAllowedQuantity) {
    return end(`Invalid quantity. Use a number between 1 and ${maxAllowedQuantity}.`)
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
    return con(
      `Ticket x${quantity}\n` +
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

    const signature =
      request.headers.get('x-ussd-signature') || request.headers.get('x-signature')

    if (!isValidUssdSignature(rawBody, signature)) {
      return end('Invalid USSD signature')
    }

    const { sessionId, phoneNumber, text } = normalizeBody(parsedInput)

    if (!phoneNumber) {
      return end('Phone number missing from USSD provider payload')
    }

    const steps = parseMenu(text)

    if (steps.length === 0) {
      return con('Welcome to BlakVote\n1. Vote\n2. Ticketing')
    }

    if (steps[0] === '1') {
      return handleVoteFlow({ steps, sessionId, phoneNumber })
    }

    if (steps[0] === '2') {
      return handleTicketFlow({ steps, sessionId, phoneNumber })
    }

    return end('Invalid option. Dial again and choose 1 for vote or 2 for ticketing.')
  } catch (error: any) {
    console.error('[USSD_ROUTE_ERROR]', error?.message || error)
    return end('Service temporarily unavailable. Please try again.')
  }
}
