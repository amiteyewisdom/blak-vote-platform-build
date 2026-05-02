import crypto from 'crypto'
import { z } from 'zod'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { isVotingOpenStatus } from '@/lib/event-status'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { logPaymentVerificationFailure, logVoteCreationFailure } from '@/lib/audit-logging'

const CANONICAL_PAID_PAYMENT_STATUS = 'paid'
const CONFIRMED_PAYMENT_STATUSES = ['success', 'paid', 'completed', 'processed']

export type PaymentProvider = 'paystack' | 'paypal' | 'nalo'
export type PaymentMethod = 'paystack' | 'paypal' | 'momo' | 'manual' | 'stripe'

const paystackInitSchema = z
  .object({
    paymentFor: z.enum(['vote', 'ticket']).optional(),
    eventId: z.string().uuid().optional(),
    candidateId: z.string().uuid().optional(),
    nomineeId: z.string().uuid().optional(),
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
    votes: z.coerce.number().int().min(1).max(1000).optional(),
    amount: z.coerce.number().positive().optional(),
    bulkPackageId: z.string().uuid().optional(),
    ticketId: z.string().uuid().optional(),
    buyerName: z.string().trim().min(2).max(120).optional(),
    buyerEmail: z.string().email().optional(),
    buyerPhone: z.string().regex(/^\+?[1-9]\d{6,14}$/).optional(),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{6,14}$/).optional(),
  })
  .superRefine((value, ctx) => {
    const paymentFor = value.paymentFor ?? (value.ticketId ? 'ticket' : 'vote')

    if (paymentFor === 'ticket') {
      if (!value.ticketId) {
        ctx.addIssue({ code: 'custom', message: 'ticketId is required', path: ['ticketId'] })
      }

      if (!value.buyerName) {
        ctx.addIssue({ code: 'custom', message: 'buyerName is required', path: ['buyerName'] })
      }

      if (!value.buyerEmail) {
        ctx.addIssue({ code: 'custom', message: 'buyerEmail is required', path: ['buyerEmail'] })
      }

      return
    }

    if (!value.eventId) {
      ctx.addIssue({ code: 'custom', message: 'eventId is required', path: ['eventId'] })
    }

    if (!value.candidateId && !value.nomineeId) {
      ctx.addIssue({ code: 'custom', message: 'candidateId is required', path: ['candidateId'] })
    }

    if (value.quantity == null && value.votes == null) {
      ctx.addIssue({ code: 'custom', message: 'quantity is required', path: ['quantity'] })
    }

    if (!value.email && !value.phone) {
      ctx.addIssue({ code: 'custom', message: 'email or phone is required', path: ['email'] })
    }
  })

const normalizedPaystackMetadataSchema = z
  .object({
    paymentFor: z.enum(['vote', 'ticket']).optional(),
    paymentId: z.coerce.string().optional(),
    eventId: z.string().optional(),
    candidateId: z.string().optional(),
    nomineeId: z.string().optional(),
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
    votes: z.coerce.number().int().min(1).max(1000).optional(),
    amount: z.coerce.number().positive().optional(),
    bulkPackageId: z.string().optional(),
    ticketId: z.string().optional(),
    buyerName: z.string().optional(),
    buyerEmail: z.string().optional(),
    buyerPhone: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  })
  .transform((value) => ({
    paymentFor: value.paymentFor ?? (value.ticketId ? 'ticket' : 'vote'),
    paymentId: value.paymentId ?? null,
    eventId: value.eventId ?? null,
    candidateId: value.candidateId ?? value.nomineeId ?? null,
    quantity: value.quantity ?? value.votes ?? null,
    amount: value.amount ?? null,
    bulkPackageId: value.bulkPackageId ?? null,
    ticketId: value.ticketId ?? null,
    buyerName: value.buyerName ?? null,
    buyerEmail: value.buyerEmail ?? null,
    buyerPhone: value.buyerPhone ?? null,
    phone: value.phone ?? null,
    email: value.email ?? null,
  }))

type PaymentInitInput = z.infer<typeof paystackInitSchema>

type ParsedVotePaymentInitialization = {
  paymentFor: 'vote'
  eventId: string
  candidateId: string
  quantity: number
  amount: number | null
  bulkPackageId: string | null
  email: string | null
  phone: string | null
}

type ParsedTicketPaymentInitialization = {
  paymentFor: 'ticket'
  ticketId: string
  quantity: number
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
}

type ParsedPaymentInitialization =
  | ParsedVotePaymentInitialization
  | ParsedTicketPaymentInitialization

export type PaymentVerificationPayload = {
  reference: string
  amount: number
  status: string
  metadata: unknown
  provider?: PaymentProvider
  paymentMethod?: PaymentMethod
  currency?: string
}

function isConfirmedPaymentStatus(status: string | null | undefined) {
  if (!status) {
    return false
  }

  return CONFIRMED_PAYMENT_STATUSES.includes(String(status).trim().toLowerCase())
}

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
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

function isPhoneRequiredForGuestVotes() {
  // Explicit policy: keep email fallback unless strict mode is enabled.
  return process.env.REQUIRE_PHONE_FOR_GUEST_VOTES === 'true'
}

function getPaystackEmail(email: string | undefined, phone: string | undefined) {
  if (email) {
    return email
  }

  return `${phone}@blakvote.local`
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

function normalizePhone(phone: string | null | undefined) {
  const normalized = phone?.trim()
  return normalized || null
}

function getGuestVoterIdentifier(
  primaryPhone: string | null | undefined,
  fallbackPhone: string | null | undefined,
  primaryEmail: string | null | undefined,
  fallbackEmail: string | null | undefined
) {
  const phone = normalizePhone(primaryPhone) ?? normalizePhone(fallbackPhone)
  if (phone) {
    return phone.slice(0, 20)
  }

  const email = normalizeEmail(primaryEmail) ?? normalizeEmail(fallbackEmail)
  if (email) {
    // Keep a deterministic short identifier for legacy schemas where voter_phone is varchar(20).
    const digest = crypto.createHash('sha256').update(email).digest('hex').slice(0, 17)
    return `em_${digest}`
  }

  return null
}

function mapPaymentErrorToStatus(message: string) {
  if (
    message === 'Event not found' ||
    message === 'Candidate not found for this event' ||
    message === 'Payment record not found' ||
    message === 'Ticket not found'
  ) {
    return 404
  }

  if (
    message === 'Voting is not active for this event' ||
    message === 'Voting has not started yet' ||
    message === 'Voting has ended'
  ) {
    return 403
  }

  if (message === 'This event does not require payment. Use the free vote flow.') {
    return 400
  }

  if (
    message === 'Ticket has already been purchased' ||
    message === 'Ticket has already been used'
  ) {
    return 409
  }

  return 400
}

async function createPaymentRecordWithSchemaFallback(
  supabase: any,
  payload: Record<string, unknown>
) {
  const mutablePayload: Record<string, unknown> = { ...payload }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase
      .from('payments')
      .insert(mutablePayload)
      .select('id')
      .single()

    if (!error && data?.id) {
      return { id: data.id as string }
    }

    const message = String(error?.message || '')
    const missingColumnMatch = message.match(/Could not find the '([^']+)' column/)

    if (missingColumnMatch) {
      const missingColumn = missingColumnMatch[1]
      if (Object.prototype.hasOwnProperty.call(mutablePayload, missingColumn)) {
        delete mutablePayload[missingColumn]
        continue
      }
    }

    throw new Error(message || 'Unable to create payment record')
  }

  throw new Error('Unable to create payment record')
}

async function verifyEventAndCandidate(
  eventId: string,
  candidateId: string,
  quantity: number
) {
  const supabase = getSupabaseAdminClient()

  const { data: strictEvent, error: strictEventError } = await supabase
    .from('events')
    .select('id, organizer_id, title, status, start_date, end_date, vote_price, cost_per_vote, voting_fee')
    .eq('id', eventId)
    .maybeSingle()

  let event = strictEvent
  let eventError = strictEventError

  // Some deployments still run older event schemas; retry with a broad select.
  if (!event && eventError) {
    const { data: fallbackEvent, error: fallbackError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle()

    if (!fallbackError && fallbackEvent) {
      event = fallbackEvent
      eventError = null
    }
  }

  if (eventError || !event) {
    throw new Error('Event not found')
  }

  if (!isVotingOpenStatus(event.status)) {
    throw new Error('Voting is not active for this event')
  }

  const now = new Date()
  if (now < new Date(event.start_date)) {
    throw new Error('Voting has not started yet')
  }
  if (now > new Date(event.end_date)) {
    throw new Error('Voting has ended')
  }

  const { data: candidate, error: candidateError } = await supabase
    .from('nominations')
    .select('id, nominee_name')
    .eq('id', candidateId)
    .eq('event_id', eventId)
    .single()

  if (candidateError || !candidate) {
    throw new Error('Candidate not found for this event')
  }

  const votePrice = resolveEventVotePrice(event)
  if (votePrice <= 0) {
    throw new Error('This event does not require payment. Use the free vote flow.')
  }

  return {
    event,
    candidate,
    votePrice,
    totalAmount: votePrice * quantity,
    supabase,
  }
}

async function verifyTicketForPurchase(ticketId: string) {
  const supabase = getSupabaseAdminClient()

  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('id, event_id, name, price, quantity, sold_count, ticket_kind, status, usage_status, payment_reference, ticket_code')
    .eq('id', ticketId)
    .maybeSingle()

  if (error || !ticket) {
    throw new Error('Ticket not found')
  }

  if (ticket.ticket_kind !== 'plan') {
    throw new Error('Ticket plan not found')
  }

  const totalQuantity = Math.max(1, Number(ticket.quantity || 1))
  const soldCount = Math.max(0, Number(ticket.sold_count || 0))
  const remainingQuantity = Math.max(totalQuantity - soldCount, 0)

  if (remainingQuantity <= 0) {
    throw new Error('Ticket plan is sold out')
  }

  return {
    ticket,
    ticketPrice: Number(ticket.price || 0),
    remainingQuantity,
    supabase,
  }
}

async function fetchIssuedTicketsForPayment(reference: string) {
  const supabase = getSupabaseAdminClient()
  const { data } = await supabase
    .from('tickets')
    .select('id, ticket_code')
    .eq('payment_reference', reference)
    .eq('ticket_kind', 'issued')
    .order('created_at', { ascending: true })

  return data || []
}

async function createVoteFallback(params: {
  supabase: ReturnType<typeof getSupabaseAdminClient>
  payment: any
  verificationReference: string
  voterIdentifier: string | null
  amountPaid: number
  paymentMethod: string
  voteSource: string
}) {
  const { supabase, payment, verificationReference, voterIdentifier, amountPaid, paymentMethod, voteSource } = params

  const basePayload = {
    event_id: payment.event_id,
    quantity: Number(payment.quantity || 1),
    voter_id: payment.user_id ?? null,
    voter_phone: voterIdentifier,
    transaction_id: verificationReference,
    amount_paid: amountPaid,
    created_at: new Date().toISOString(),
  }

  const candidatePayloads = [
    {
      ...basePayload,
      candidate_id: payment.candidate_id,
      vote_source: voteSource,
      payment_method: paymentMethod,
      vote_type: amountPaid > 0 ? 'paid' : 'free',
      is_manual: false,
    },
    {
      ...basePayload,
      candidate_id: payment.candidate_id,
    },
  ]

  let insertError: { message?: string } | null = null
  let insertedVoteId: string | null = null

  for (const payload of candidatePayloads) {
    const insertAttempt = await supabase
      .from('votes')
      .insert(payload)
      .select('id')
      .maybeSingle()

    if (!insertAttempt.error && insertAttempt.data?.id) {
      insertedVoteId = insertAttempt.data.id
      insertError = null
      break
    }

    insertError = insertAttempt.error
  }

  const shouldTryNominee = String(insertError?.message || '').toLowerCase().includes('candidate_id')

  if (!insertedVoteId && shouldTryNominee) {
    const nomineePayloads = [
      {
        ...basePayload,
        nominee_id: payment.candidate_id,
        vote_source: voteSource,
        payment_method: paymentMethod,
        vote_type: amountPaid > 0 ? 'paid' : 'free',
        is_manual: false,
      },
      {
        ...basePayload,
        nominee_id: payment.candidate_id,
      },
    ]

    for (const payload of nomineePayloads) {
      const insertAttempt = await supabase
        .from('votes')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (!insertAttempt.error && insertAttempt.data?.id) {
        insertedVoteId = insertAttempt.data.id
        insertError = null
        break
      }

      insertError = insertAttempt.error
    }
  }

  if (insertError || !insertedVoteId) {
    return {
      ok: false as const,
      error: insertError?.message || 'Unable to create vote record',
    }
  }

  return {
    ok: true as const,
    voteId: insertedVoteId,
  }
}

async function issueTicketPurchaseFallback(params: {
  supabase: ReturnType<typeof getSupabaseAdminClient>
  planId: string
  paymentReference: string
  buyerName: string | null
  buyerEmail: string | null
  buyerPhone: string | null
  quantity: number
}) {
  const { supabase, planId, paymentReference, buyerName, buyerEmail, buyerPhone, quantity } = params
  const nowIso = new Date().toISOString()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: plan, error: planError } = await supabase
      .from('tickets')
      .select('id, event_id, name, price, admin_fee, quantity, sold_count, ticket_kind, ticket_type')
      .eq('id', planId)
      .maybeSingle()

    if (planError || !plan) {
      return { ok: false as const, error: planError?.message || 'Ticket plan not found' }
    }

    const totalQuantity = Math.max(1, Number(plan.quantity || 1))
    const soldCount = Math.max(0, Number(plan.sold_count || 0))
    const remaining = Math.max(totalQuantity - soldCount, 0)

    if (remaining < quantity) {
      return { ok: false as const, error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining for this plan` }
    }

    const { data: updatedPlan, error: updatePlanError } = await supabase
      .from('tickets')
      .update({
        sold_count: soldCount + quantity,
        updated_at: nowIso,
      })
      .eq('id', plan.id)
      .eq('sold_count', soldCount)
      .select('id')
      .maybeSingle()

    if (updatePlanError || !updatedPlan) {
      continue
    }

    const issuedRows = Array.from({ length: quantity }, () => ({
      event_id: plan.event_id,
      parent_ticket_id: plan.id,
      ticket_kind: 'issued',
      ticket_type: plan.ticket_type ?? (Number(plan.price || 0) > 0 ? 'paid' : 'free'),
      name: plan.name,
      price: Number(plan.price || 0),
      quantity: 1,
      admin_fee: Number(plan.admin_fee || 0),
      ticket_code: crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12),
      status: 'valid',
      usage_status: 'unused',
      payment_reference: paymentReference,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
      purchased_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }))

    const { data: issuedTickets, error: issuedError } = await supabase
      .from('tickets')
      .insert(issuedRows)
      .select('id, ticket_code')

    if (issuedError || !issuedTickets || issuedTickets.length === 0) {
      return { ok: false as const, error: issuedError?.message || 'Unable to issue tickets after payment verification' }
    }

    return {
      ok: true as const,
      issuedTickets: issuedTickets.map((row) => ({ ticket_id: row.id, ticket_code: row.ticket_code })),
    }
  }

  return { ok: false as const, error: 'Ticket inventory changed during checkout. Please retry verification.' }
}

async function resolveBulkVotePricing(params: {
  supabase: ReturnType<typeof getSupabaseAdminClient>
  eventId: string
  quantity: number
  baseVotePrice: number
  requestedAmount: number | null
  bulkPackageId: string | null
}) {
  const { supabase, eventId, quantity, baseVotePrice, requestedAmount, bulkPackageId } = params
  const baseAmount = Number((baseVotePrice * quantity).toFixed(2))

  let packageAmount: number | null = null
  let appliedBulkPackageId: string | null = null

  if (bulkPackageId) {
    const { data: packageRow } = await supabase
      .from('bulk_vote_packages')
      .select('id, votes_included, price_per_package, is_active')
      .eq('id', bulkPackageId)
      .eq('event_id', eventId)
      .maybeSingle()

    if (!packageRow || !packageRow.is_active || Number(packageRow.votes_included) !== quantity) {
      throw new Error('Selected bulk package is invalid for this vote quantity')
    }

    packageAmount = Number(packageRow.price_per_package)
    appliedBulkPackageId = packageRow.id
  } else {
    const { data: packageRow } = await supabase
      .from('bulk_vote_packages')
      .select('id, price_per_package')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .eq('votes_included', quantity)
      .maybeSingle()

    if (packageRow) {
      packageAmount = Number(packageRow.price_per_package)
      appliedBulkPackageId = packageRow.id
    }
  }

  const validAmounts = [baseAmount]
  if (packageAmount != null) {
    validAmounts.push(Number(packageAmount.toFixed(2)))
  }

  let totalAmount = packageAmount != null ? Number(packageAmount.toFixed(2)) : baseAmount

  if (requestedAmount != null) {
    const normalizedRequestedAmount = Number(requestedAmount.toFixed(2))
    const matchesAllowedPrice = validAmounts.some((price) => Math.abs(price - normalizedRequestedAmount) < 0.01)

    if (!matchesAllowedPrice) {
      throw new Error('Selected bulk amount does not match configured pricing')
    }

    totalAmount = normalizedRequestedAmount
  }

  const savings = Math.max(0, Number((baseAmount - totalAmount).toFixed(2)))
  const unitPrice = Number((totalAmount / quantity).toFixed(4))

  return {
    totalAmount,
    baseAmount,
    unitPrice,
    savings,
    appliedBulkPackageId,
  }
}

export function parsePaymentInitialization(input: unknown) {
  const parsed = paystackInitSchema.safeParse(input)

  if (!parsed.success) {
    return parsed
  }

  const paymentFor = parsed.data.paymentFor ?? (parsed.data.ticketId ? 'ticket' : 'vote')

  if (paymentFor === 'ticket') {
    return {
      success: true as const,
      data: {
        paymentFor: 'ticket' as const,
        ticketId: parsed.data.ticketId!,
        quantity: parsed.data.quantity ?? 1,
        buyerName: parsed.data.buyerName!.trim(),
        buyerEmail: normalizeEmail(parsed.data.buyerEmail)!,
        buyerPhone: normalizePhone(parsed.data.buyerPhone),
      } satisfies ParsedTicketPaymentInitialization,
    }
  }

  const normalized = {
    paymentFor: 'vote' as const,
    eventId: parsed.data.eventId,
    candidateId: parsed.data.candidateId ?? parsed.data.nomineeId!,
    quantity: parsed.data.quantity ?? parsed.data.votes!,
    amount: parsed.data.amount ?? null,
    bulkPackageId: parsed.data.bulkPackageId ?? null,
    email: normalizeEmail(parsed.data.email),
    phone: normalizePhone(parsed.data.phone),
  }

  return {
    success: true as const,
    data: normalized,
  }
}

export async function initializeVotePayment(input: PaymentInitInput | unknown) {
  const parsed = parsePaymentInitialization(input)
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
    }
  }

  if (parsed.data.paymentFor === 'ticket') {
    const { ticketId, quantity, buyerName, buyerEmail, buyerPhone } = parsed.data

    let verifiedTicket

    try {
      verifiedTicket = await verifyTicketForPurchase(ticketId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment initialization failed'
      return {
        ok: false as const,
        status: mapPaymentErrorToStatus(message),
        body: { error: message },
      }
    }

    const { ticket, ticketPrice, remainingQuantity, supabase } = verifiedTicket
    const { data: ticketEvent } = await supabase
      .from('events')
      .select('organizer_id')
      .eq('id', ticket.event_id)
      .maybeSingle()

    if (remainingQuantity < quantity) {
      return {
        ok: false as const,
        status: 409,
        body: { error: `Only ${remainingQuantity} ticket${remainingQuantity === 1 ? '' : 's'} remaining for this plan` },
      }
    }

    if (ticketPrice <= 0) {
      return {
        ok: false as const,
        status: 400,
        body: { error: 'Free tickets should use the ticket purchase endpoint directly.' },
      }
    }

    const reference = `PAY-${crypto.randomUUID()}`
    const callbackUrl = `${getSiteBaseUrl()}/payment/success`

    const payment = await createPaymentRecordWithSchemaFallback(supabase, {
      reference,
      event_id: ticket.event_id,
      organizer_id: ticketEvent?.organizer_id ?? null,
      candidate_id: null,
      quantity,
      voter_email: buyerEmail,
      voter_phone: buyerPhone,
      amount: Number((ticketPrice * quantity).toFixed(2)),
      status: 'pending',
      payment_method: 'paystack',
      provider: 'paystack',
      gateway_status: 'initialized',
      payment_context: 'ticket',
      metadata: {
        paymentFor: 'ticket',
        eventId: ticket.event_id,
        ticketId: ticket.id,
        quantity,
        buyerName,
        buyerEmail,
        buyerPhone,
      },
    })

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: buyerEmail,
        amount: Math.round(ticketPrice * quantity * 100),
        reference,
        callback_url: callbackUrl,
        metadata: {
          paymentId: payment.id,
          paymentFor: 'ticket',
          eventId: ticket.event_id,
          ticketId: ticket.id,
          quantity,
          buyerName,
          buyerEmail,
          buyerPhone,
        },
      }),
    })

    const payload = await response.json()

    if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
      await supabase
        .from('payments')
        .update({ status: 'failed', gateway_status: 'initialize_failed' })
        .eq('reference', reference)

      return {
        ok: false as const,
        status: 502,
        body: { error: payload?.message || 'Payment initialization failed' },
      }
    }

    await supabase
      .from('payments')
      .update({
        authorization_url: payload.data.authorization_url,
        access_code: payload.data.access_code ?? null,
      })
      .eq('reference', reference)

    return {
      ok: true as const,
      status: 200,
      body: {
        authorization_url: payload.data.authorization_url,
        access_code: payload.data.access_code ?? null,
        reference,
      },
    }
  }

  const voteData = parsed.data as ParsedVotePaymentInitialization
  const { eventId, candidateId, quantity, amount, bulkPackageId, email, phone } = voteData

  if (isPhoneRequiredForGuestVotes() && !phone) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Phone number is required for voting on this deployment.' },
    }
  }

  let supabase
  let organizerId: string | null = null
  let totalAmount
  let votePrice
  let baseAmount = 0
  let unitPrice = 0
  let savings = 0
  let appliedBulkPackageId: string | null = null

  try {
    const verified = await verifyEventAndCandidate(eventId, candidateId, quantity)
    supabase = verified.supabase
    votePrice = verified.votePrice
    organizerId = verified.event.organizer_id ?? null

    const pricing = await resolveBulkVotePricing({
      supabase,
      eventId,
      quantity,
      baseVotePrice: votePrice,
      requestedAmount: amount,
      bulkPackageId,
    })

    totalAmount = pricing.totalAmount
    baseAmount = pricing.baseAmount
    unitPrice = pricing.unitPrice
    savings = pricing.savings
    appliedBulkPackageId = pricing.appliedBulkPackageId
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment initialization failed'
    return {
      ok: false as const,
      status: mapPaymentErrorToStatus(message),
      body: { error: message },
    }
  }

  // ========================================================================
  // SAFEGUARD 1: Check for duplicate pending/success payments
  // ========================================================================
  if (phone) {
    const { data: existingPaymentCheck, error: dupCheckError } = await supabase
      .rpc('check_voter_pending_payment_limit', {
        p_voter_phone: phone,
        p_max_pending: 5,
      })

    if (dupCheckError) {
      console.warn('Duplicate payment check failed:', dupCheckError.message)
    } else if (existingPaymentCheck && existingPaymentCheck.length > 0) {
      const { limit_exceeded } = existingPaymentCheck[0]
      if (limit_exceeded) {
        return {
          ok: false as const,
          status: 429,
          body: {
            error: 'Too many pending payments. Please wait for previous payments to complete.',
          },
        }
      }
    }

    // ====================================================================
    // SAFEGUARD 2: Check daily fraud pattern (max attempts per day)
    // ====================================================================
    const { data: fraudCheckResult, error: fraudCheckError } = await supabase
      .rpc('check_fraud_pattern_daily_limit', {
        p_voter_phone: phone,
        p_max_daily_attempts: 10,
      })

    if (fraudCheckError) {
      console.warn('Fraud pattern check failed:', fraudCheckError.message)
    } else if (fraudCheckResult && fraudCheckResult.length > 0) {
      const { limit_exceeded } = fraudCheckResult[0]
      if (limit_exceeded) {
        // Log failed attempt for analytics
        await supabase.from('payment_failed_attempts').insert({
          voter_phone: phone,
          event_id: eventId,
          reason: 'Daily attempt limit exceeded',
          gateway_status: 'daily_limit_exceeded',
        })

        return {
          ok: false as const,
          status: 429,
          body: {
            error:
              'Too many payment attempts today. Please try again tomorrow or contact support.',
          },
        }
      }
    }
  }

  const reference = `PAY-${crypto.randomUUID()}`
  const callbackUrl = `${getSiteBaseUrl()}/payment/success`

  const payment = await createPaymentRecordWithSchemaFallback(supabase, {
    reference,
    event_id: eventId,
    organizer_id: organizerId,
    candidate_id: candidateId,
    quantity,
    voter_email: email ?? null,
    voter_phone: phone ?? null,
    amount: totalAmount,
    status: 'pending',
    payment_method: 'paystack',
    provider: 'paystack',
    gateway_status: 'initialized',
    metadata: {
      paymentFor: 'vote',
      eventId,
      candidateId,
      quantity,
      amount: totalAmount,
      bulkPackageId: appliedBulkPackageId,
      email: email ?? null,
      phone: phone ?? null,
      votePrice,
      unitPrice,
      baseAmount,
      savings,
    },
  })

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: getPaystackEmail(email ?? undefined, phone ?? undefined),
      amount: totalAmount * 100,
      reference,
      callback_url: callbackUrl,
      metadata: {
        paymentId: payment.id,
        paymentFor: 'vote',
        eventId,
        candidateId,
        quantity,
        amount: totalAmount,
        bulkPackageId: appliedBulkPackageId,
        phone: phone ?? null,
        email: email ?? null,
        unitPrice,
        baseAmount,
        savings,
      },
    }),
  })

  const payload = await response.json()

  if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
    await supabase
      .from('payments')
      .update({ status: 'failed', gateway_status: 'initialize_failed' })
      .eq('reference', reference)

    return {
      ok: false as const,
      status: 502,
      body: { error: payload?.message || 'Payment initialization failed' },
    }
  }

  await supabase
    .from('payments')
    .update({
      authorization_url: payload.data.authorization_url,
      access_code: payload.data.access_code ?? null,
    })
    .eq('reference', reference)

  return {
    ok: true as const,
    status: 200,
    body: {
      authorization_url: payload.data.authorization_url,
      access_code: payload.data.access_code ?? null,
      reference,
    },
  }
}

export async function verifyPaystackReference(reference: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY')}`,
    },
  })

  const payload = await response.json()

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.message || 'Unable to verify payment with Paystack')
  }

  return {
    reference: payload.data.reference as string,
    amount: Number(payload.data.amount) / 100,
    status: payload.data.status as string,
    metadata: payload.data.metadata,
  }
}

export async function processConfirmedPayment(verification: PaymentVerificationPayload) {
  const supabase = getSupabaseAdminClient()
  const parsedMetadata = normalizedPaystackMetadataSchema.safeParse(verification.metadata ?? {})

  if (!parsedMetadata.success) {
    console.error('[PAYMENT_VERIFY_FAIL] Invalid metadata schema:', parsedMetadata.error, { reference: verification.reference })
    await logPaymentVerificationFailure(verification.reference, 'Invalid metadata schema')
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Invalid payment metadata' },
    }
  }

  const metadata = parsedMetadata.data

  const paymentContext = metadata.paymentFor

  if (paymentContext === 'vote' && (!metadata.candidateId || !metadata.quantity)) {
    console.error('[PAYMENT_VERIFY_FAIL] Missing candidate or quantity:', { reference: verification.reference })
    await logPaymentVerificationFailure(verification.reference, 'Missing candidate or quantity')
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Invalid payment metadata' },
    }
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', verification.reference)
    .maybeSingle()

  if (paymentError) {
    console.error('[PAYMENT_VERIFY_FAIL] Database error:', paymentError, { reference: verification.reference })
    await logPaymentVerificationFailure(verification.reference, `Database error: ${paymentError.message}`)
    return {
      ok: false as const,
      status: 500,
      body: { error: paymentError.message },
    }
  }

  if (!payment) {
    console.error('[PAYMENT_VERIFY_FAIL] Payment record not found:', { reference: verification.reference })
    await logPaymentVerificationFailure(verification.reference, 'Payment record not found')
    return {
      ok: false as const,
      status: 404,
      body: { error: 'Payment record not found' },
    }
  }

  if (paymentContext === 'vote' && payment.vote_id) {
    console.log('[PAYMENT_VERIFY_IDEMPOTENT] Vote already created:', { reference: verification.reference, vote_id: payment.vote_id })
    return {
      ok: true as const,
      status: 200,
      body: { success: true, voteId: payment.vote_id, alreadyProcessed: true },
    }
  }

  if (paymentContext === 'ticket' && payment.ticket_id) {
    const issuedTickets = await fetchIssuedTicketsForPayment(verification.reference)

    return {
      ok: true as const,
      status: 200,
      body: {
        success: true,
        resource: 'ticket',
        ticketId: payment.ticket_id,
        ticketCode: issuedTickets[0]?.ticket_code ?? null,
        ticketCodes: issuedTickets.map((ticket) => ticket.ticket_code),
        alreadyProcessed: true,
      },
    }
  }

  if (!isConfirmedPaymentStatus(verification.status)) {
    console.warn('[PAYMENT_VERIFY_FAIL] Payment not successful:', { reference: verification.reference, status: verification.status })
    await logPaymentVerificationFailure(verification.reference, `Payment not successful: ${verification.status}`)
    await supabase
      .from('payments')
      .update({ status: 'failed', gateway_status: verification.status, verified_at: new Date().toISOString() })
      .eq('reference', verification.reference)

    return {
      ok: false as const,
      status: 400,
      body: { error: 'Payment not successful' },
    }
  }

  if (
    (paymentContext === 'vote' && (
      payment.event_id !== metadata.eventId ||
      payment.candidate_id !== metadata.candidateId ||
      Number(payment.quantity) !== metadata.quantity
    )) ||
    (paymentContext === 'ticket' && (
      payment.event_id !== metadata.eventId ||
      !metadata.ticketId
    ))
  ) {
    console.error('[PAYMENT_VERIFY_FAIL] Metadata mismatch:', { reference: verification.reference, payment, metadata })
    await logPaymentVerificationFailure(verification.reference, 'Metadata mismatch')
    await supabase
      .from('payments')
      .update({ status: 'failed', gateway_status: 'metadata_mismatch', verified_at: new Date().toISOString() })
      .eq('reference', verification.reference)

    return {
      ok: false as const,
      status: 409,
      body: { error: 'Payment metadata does not match pending payment record' },
    }
  }

  if (Number(payment.amount) !== Number(verification.amount)) {
    console.error('[PAYMENT_VERIFY_FAIL] Amount mismatch:', { reference: verification.reference, expected: payment.amount, received: verification.amount })
    await logPaymentVerificationFailure(verification.reference, `Amount mismatch: expected ${payment.amount}, received ${verification.amount}`)
    await supabase
      .from('payments')
      .update({ status: 'failed', gateway_status: 'amount_mismatch', verified_at: new Date().toISOString() })
      .eq('reference', verification.reference)

    return {
      ok: false as const,
      status: 409,
      body: { error: 'Payment amount does not match the expected vote cost' },
    }
  }

  if (paymentContext === 'vote') {
    const { data: existingVote, error: existingVoteError } = await supabase
      .from('votes')
      .select('id')
      .eq('transaction_id', verification.reference)
      .maybeSingle()

    if (existingVoteError) {
      console.error('[PAYMENT_VERIFY_FAIL] Error checking existing vote:', existingVoteError, { reference: verification.reference })
      await logPaymentVerificationFailure(verification.reference, `Error checking existing vote: ${existingVoteError.message}`)
      return {
        ok: false as const,
        status: 500,
        body: { error: existingVoteError.message },
      }
    }

    if (existingVote?.id) {
      console.log('[PAYMENT_VERIFY_IDEMPOTENT] Existing vote found, linking to payment:', { reference: verification.reference, vote_id: existingVote.id })
      await supabase
        .from('payments')
        .update({
          vote_id: existingVote.id,
          status: CANONICAL_PAID_PAYMENT_STATUS,
          gateway_status: verification.status,
          verified_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        })
        .eq('reference', verification.reference)

      return {
        ok: true as const,
        status: 200,
        body: { success: true, voteId: existingVote.id, alreadyProcessed: true },
      }
    }
  }

  const verificationStartedAt = new Date().toISOString()
  const { data: lockedPayment, error: lockError } = await supabase
    .from('payments')
    .update({
      status: 'pending',
      gateway_status: 'verification_in_progress',
      verified_at: verificationStartedAt,
    })
    .eq('reference', verification.reference)
    .in('status', ['pending', 'failed'])
    .neq('gateway_status', 'verification_in_progress')
    .is(paymentContext === 'vote' ? 'vote_id' : 'ticket_id', null)
    .select('id')
    .maybeSingle()

  if (lockError) {
    console.error('[PAYMENT_VERIFY_FAIL] Unable to acquire verification lock:', lockError, {
      reference: verification.reference,
    })
    await logPaymentVerificationFailure(
      verification.reference,
      `Unable to acquire verification lock: ${lockError.message}`
    )
    return {
      ok: false as const,
      status: 500,
      body: { error: lockError.message },
    }
  }

  if (!lockedPayment) {
    const { data: latestPayment, error: latestPaymentError } = await supabase
      .from('payments')
      .select('vote_id, ticket_id, status, gateway_status')
      .eq('reference', verification.reference)
      .maybeSingle()

    if (latestPaymentError) {
      console.error('[PAYMENT_VERIFY_FAIL] Unable to read payment after lock miss:', latestPaymentError, {
        reference: verification.reference,
      })
      await logPaymentVerificationFailure(
        verification.reference,
        `Unable to read payment after lock miss: ${latestPaymentError.message}`
      )
      return {
        ok: false as const,
        status: 500,
        body: { error: latestPaymentError.message },
      }
    }

    if (paymentContext === 'vote' && latestPayment?.vote_id) {
      return {
        ok: true as const,
        status: 200,
        body: { success: true, voteId: latestPayment.vote_id, alreadyProcessed: true },
      }
    }

    if (paymentContext === 'ticket' && latestPayment?.ticket_id) {
      const issuedTickets = await fetchIssuedTicketsForPayment(verification.reference)

      return {
        ok: true as const,
        status: 200,
        body: {
          success: true,
          resource: 'ticket',
          ticketId: latestPayment.ticket_id,
          ticketCode: issuedTickets[0]?.ticket_code ?? null,
          ticketCodes: issuedTickets.map((ticket) => ticket.ticket_code),
          alreadyProcessed: true,
        },
      }
    }

    if (latestPayment?.gateway_status === 'verification_in_progress' || isConfirmedPaymentStatus(latestPayment?.status)) {
      return {
        ok: false as const,
        status: 202,
        body: { error: 'Payment verification is already in progress. Please refresh shortly.' },
      }
    }

    return {
      ok: false as const,
      status: 409,
      body: { error: 'Payment is no longer pending verification.' },
    }
  }

  if (paymentContext === 'ticket') {
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, event_id, name, price, admin_fee, quantity, sold_count, ticket_kind, ticket_type')
      .eq('id', metadata.ticketId)
      .maybeSingle()

    if (ticketError || !ticket) {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'ticket_not_found',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 404,
        body: { error: 'Ticket not found' },
      }
    }

    if (ticket.ticket_kind !== 'plan') {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'ticket_plan_invalid',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 409,
        body: { error: 'Ticket plan is invalid' },
      }
    }

    if (ticket.event_id !== payment.event_id) {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'ticket_event_mismatch',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 409,
        body: { error: 'Ticket event does not match payment event' },
      }
    }

    const requestedQuantity = Math.max(1, Number(metadata.quantity || payment.quantity || 1))
    const totalQuantity = Math.max(1, Number(ticket.quantity || 1))
    const soldCount = Math.max(0, Number(ticket.sold_count || 0))
    const remainingQuantity = Math.max(totalQuantity - soldCount, 0)

    if (remainingQuantity < requestedQuantity) {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'ticket_sold_out',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 409,
        body: { error: `Only ${remainingQuantity} ticket${remainingQuantity === 1 ? '' : 's'} remaining for this plan` },
      }
    }

    const { data: issuedTickets, error: updateTicketError } = await supabase.rpc('issue_ticket_purchase', {
      p_plan_id: ticket.id,
      p_payment_reference: verification.reference,
      p_buyer_name: metadata.buyerName,
      p_buyer_email: metadata.buyerEmail ?? payment.voter_email,
      p_buyer_phone: metadata.buyerPhone ?? payment.voter_phone,
      p_quantity: requestedQuantity,
    })

    let finalIssuedTickets = issuedTickets

    if (updateTicketError) {
      const rpcMessage = String(updateTicketError.message || '').toLowerCase()
      const canFallback =
        rpcMessage.includes('ambiguous') ||
        rpcMessage.includes('structure of query does not match function result type') ||
        rpcMessage.includes('function issue_ticket_purchase')

      if (canFallback) {
        const fallback = await issueTicketPurchaseFallback({
          supabase,
          planId: String(ticket.id),
          paymentReference: verification.reference,
          buyerName: metadata.buyerName,
          buyerEmail: metadata.buyerEmail ?? payment.voter_email,
          buyerPhone: metadata.buyerPhone ?? payment.voter_phone,
          quantity: requestedQuantity,
        })

        if (fallback.ok) {
          finalIssuedTickets = fallback.issuedTickets
        } else {
          await supabase
            .from('payments')
            .update({
              status: 'failed',
              gateway_status: 'ticket_issue_failed',
              verified_at: verificationStartedAt,
            })
            .eq('reference', verification.reference)

          return {
            ok: false as const,
            status: 409,
            body: { error: fallback.error },
          }
        }
      }
    }

    if (!(finalIssuedTickets && finalIssuedTickets.length > 0)) {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'ticket_issue_failed',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 409,
        body: { error: updateTicketError?.message || 'Unable to issue ticket after payment verification' },
      }
    }

    await supabase
      .from('payments')
      .update({
        ticket_id: finalIssuedTickets[0].ticket_id,
        status: CANONICAL_PAID_PAYMENT_STATUS,
        gateway_status: verification.status,
        verified_at: verificationStartedAt,
        processed_at: new Date().toISOString(),
      })
      .eq('reference', verification.reference)

    return {
      ok: true as const,
      status: 200,
      body: {
        success: true,
        resource: 'ticket',
        ticketId: finalIssuedTickets[0].ticket_id,
        ticketCode: finalIssuedTickets[0].ticket_code,
        ticketCodes: finalIssuedTickets.map((issuedTicket: { ticket_code: string }) => issuedTicket.ticket_code),
        paymentId: payment.id,
        eventId: payment.event_id,
      },
    }
  }

  let eventCheck

  try {
    eventCheck = await verifyEventAndCandidate(payment.event_id, payment.candidate_id, Number(payment.quantity))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment verification failed'
    console.error('[PAYMENT_VERIFY_FAIL] Event/candidate check failed:', { reference: verification.reference, error: message })
    
    // ✅ HIGH FIX #7: Event end-check (already handled by verifyEventAndCandidate throwing error)
    if (message.includes('Voting has ended')) {
      await supabase
        .from('payments')
        .update({ status: 'failed', gateway_status: 'event_ended', verified_at: new Date().toISOString() })
        .eq('reference', verification.reference)
      await logVoteCreationFailure('Voting has ended', payment.event_id)
    } else {
      await logPaymentVerificationFailure(verification.reference, message)
    }
    
    return {
      ok: false as const,
      status: mapPaymentErrorToStatus(message),
      body: { error: message },
    }
  }

  console.log('[PAYMENT_VERIFY_SUCCESS] Creating vote via RPC:', { reference: verification.reference, payment_id: payment.id })

  const voterPhoneOrIdentifier = getGuestVoterIdentifier(
    payment.voter_phone,
    metadata.phone,
    payment.voter_email,
    metadata.email
  )

  const amountPaid = Number.isFinite(Number(payment.amount))
    ? Number(payment.amount)
    : Number.isFinite(Number(verification.amount))
      ? Number(verification.amount)
      : 0

  const resolvedPaymentMethod =
    verification.paymentMethod ?? payment.payment_method ?? (verification.provider === 'nalo' ? 'momo' : 'paystack')
  const resolvedVoteSource = verification.provider === 'nalo' ? 'momo' : 'online'

  const { error: rpcError } = await supabase.rpc('process_vote', {
    p_event_id: payment.event_id,
    p_candidate_id: payment.candidate_id,
    p_quantity: Number(payment.quantity),
    p_voter_id: payment.user_id ?? null,
    p_voter_phone: voterPhoneOrIdentifier,
    p_vote_source: resolvedVoteSource,
    p_payment_method: resolvedPaymentMethod,
    p_transaction_id: verification.reference,
    p_ip_address: null,
    p_amount_paid: amountPaid,
  })

  if (rpcError) {
    console.error('[VOTE_CREATION_FAIL] RPC error:', rpcError, { reference: verification.reference })

    const fallbackVote = await createVoteFallback({
      supabase,
      payment,
      verificationReference: verification.reference,
      voterIdentifier: voterPhoneOrIdentifier,
      amountPaid,
      paymentMethod: resolvedPaymentMethod,
      voteSource: resolvedVoteSource,
    })

    if (!fallbackVote.ok) {
      await logVoteCreationFailure(`RPC error: ${rpcError.message}; fallback error: ${fallbackVote.error}`, payment.event_id)
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: 'vote_creation_failed',
          verified_at: verificationStartedAt,
        })
        .eq('reference', verification.reference)

      return {
        ok: false as const,
        status: 400,
        body: { error: fallbackVote.error },
      }
    }

    await supabase
      .from('payments')
      .update({
        vote_id: fallbackVote.voteId,
        status: CANONICAL_PAID_PAYMENT_STATUS,
        gateway_status: verification.status,
        verified_at: verificationStartedAt,
        processed_at: new Date().toISOString(),
      })
      .eq('reference', verification.reference)

    return {
      ok: true as const,
      status: 200,
      body: {
        success: true,
        resource: 'vote',
        voteId: fallbackVote.voteId,
        paymentId: payment.id,
        eventId: payment.event_id,
        fallbackApplied: true,
      },
    }
  }

  const { data: createdVote, error: createdVoteError } = await supabase
    .from('votes')
    .select('id')
    .eq('transaction_id', verification.reference)
    .maybeSingle()

  if (createdVoteError || !createdVote) {
    console.error('[VOTE_CREATION_FAIL] Vote not found after RPC:', createdVoteError, { reference: verification.reference })
    await logVoteCreationFailure(
      createdVoteError?.message || 'Vote not found after RPC',
      payment.event_id
    )
    await supabase
      .from('payments')
      .update({
        status: 'failed',
        gateway_status: 'vote_lookup_failed',
        verified_at: verificationStartedAt,
      })
      .eq('reference', verification.reference)
    return {
      ok: false as const,
      status: 500,
      body: { error: createdVoteError?.message || 'Vote was created but could not be linked to payment' },
    }
  }

  await supabase
    .from('payments')
    .update({
      vote_id: createdVote.id,
      status: CANONICAL_PAID_PAYMENT_STATUS,
      gateway_status: verification.status,
      verified_at: verificationStartedAt,
      processed_at: new Date().toISOString(),
    })
    .eq('reference', verification.reference)

  console.log('[VOTE_CREATION_SUCCESS] Payment and vote linked:', { reference: verification.reference, vote_id: createdVote.id, payment_id: payment.id })

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      resource: 'vote',
      voteId: createdVote.id,
      paymentId: payment.id,
      eventId: eventCheck.event.id,
    },
  }
}

// =============================================================================
// Payment Safeguard Helpers: Cleanup, Monitoring, Maintenance
// =============================================================================

export async function cleanupStalePayments(ageMinutes: number = 30) {
  const supabase = getSupabaseAdminClient()

  try {
    const { data, error } = await supabase.rpc('mark_stale_payments_as_failed')

    if (error) {
      console.error('Failed to mark stale payments:', error.message)
      return { ok: false as const, error: error.message }
    }

    const markedCount = data?.[0]?.marked_count ?? 0
    console.log(`✓ Marked ${markedCount} stale payments as failed`)

    return { ok: true as const, markedCount }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed'
    console.error('Payment stale cleanup error:', message)
    return { ok: false as const, error: message }
  }
}

export async function cleanupGhostPayments(ageMinutes: number = 60) {
  const supabase = getSupabaseAdminClient()

  try {
    const { data, error } = await supabase.rpc('cleanup_ghost_payments', {
      p_age_minutes: ageMinutes,
    })

    if (error) {
      console.error('Failed to cleanup ghost payments:', error.message)
      return { ok: false as const, error: error.message }
    }

    const result = data?.[0] ?? { deleted_count: 0, archived_count: 0 }
    console.log(
      `✓ Ghost payment cleanup: ${result.archived_count} archived, ${result.deleted_count} deleted`
    )

    return {
      ok: true as const,
      archived: result.archived_count,
      deleted: result.deleted_count,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed'
    console.error('Ghost payment cleanup error:', message)
    return { ok: false as const, error: message }
  }
}

export async function cleanupStuckVerifyingPayments(ageMinutes: number = 20) {
  const supabase = getSupabaseAdminClient()

  try {
    const thresholdIso = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'failed',
        gateway_status: 'verification_timeout',
        processed_at: new Date().toISOString(),
      })
      .eq('status', 'pending')
      .eq('gateway_status', 'verification_in_progress')
      .is('vote_id', null)
      .is('ticket_id', null)
      .lt('verified_at', thresholdIso)
      .select('id')

    if (error) {
      console.error('Failed to cleanup stuck verifying payments:', error.message)
      return { ok: false as const, error: error.message }
    }

    const markedCount = data?.length ?? 0
    console.log(`✓ Marked ${markedCount} stuck verifying payments as failed`)

    return { ok: true as const, markedCount }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed'
    console.error('Stuck verification cleanup error:', message)
    return { ok: false as const, error: message }
  }
}

export async function getPaymentStats() {
  const supabase = getSupabaseAdminClient()

  try {
    const [
      { count: pendingCount },
      { count: verifyingCount },
      { count: processedCount },
      { count: failedCount },
    ] =
      await Promise.all([
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('gateway_status', 'verification_in_progress'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).in('status', ['paid', 'success', 'processed']),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])

    // Get stale pending payments (> 30 mins)
    const { count: staleCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    const { count: stuckVerifyingCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('gateway_status', 'verification_in_progress')
      .lt('verified_at', new Date(Date.now() - 20 * 60 * 1000).toISOString())

    return {
      ok: true as const,
      stats: {
        pending: pendingCount ?? 0,
        stale: staleCount ?? 0,
        verifying: verifyingCount ?? 0,
        stuckVerifying: stuckVerifyingCount ?? 0,
        processed: processedCount ?? 0,
        failed: failedCount ?? 0,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stats query failed'
    console.error('Payment stats query error:', message)
    return { ok: false as const, error: message }
  }
}