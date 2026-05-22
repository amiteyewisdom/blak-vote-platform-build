type SupabaseLike = {
  from: (table: string) => any
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>
}

const PAID_PAYMENT_STATUSES = ['processed', 'success', 'paid']
const REVENUE_PAYMENT_CONTEXTS = ['vote', 'ticket']

function toNumber(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function toStringOrNull(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeStoredPaymentProvider(paymentReference: unknown, provider: unknown) {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const reference = String(paymentReference || '').trim().toUpperCase()

  if (normalizedProvider === 'nalo' || reference.startsWith('USSD-')) {
    return 'nalo'
  }

  if (normalizedProvider === 'paypal') {
    return 'paypal'
  }

  return 'paystack'
}

async function resolveAdminRevenueFeePercent(
  adminSupabase: SupabaseLike,
  paymentContext: string,
  organizerRef: string | null
) {
  const { getEffectiveTicketingFeePercent, getEffectiveVotePlatformFeePercent } = await import(
    '@/lib/organizer-fees'
  )

  if (paymentContext === 'ticket') {
    return getEffectiveTicketingFeePercent(adminSupabase, organizerRef)
  }

  return getEffectiveVotePlatformFeePercent(adminSupabase, organizerRef)
}

export async function syncMissingAdminRevenueTransactions(adminSupabase: SupabaseLike) {
  const { data: paidPayments, error: paymentsError } = await adminSupabase
    .from('payments')
    .select('id,reference,event_id,vote_id,ticket_id,payment_context,provider,amount,status,processed_at,verified_at,updated_at,created_at')
    .in('status', PAID_PAYMENT_STATUSES)
    .in('payment_context', REVENUE_PAYMENT_CONTEXTS)

  if (paymentsError) {
    throw new Error(paymentsError.message)
  }

  const paymentRows = ((paidPayments || []) as Array<Record<string, unknown>>).filter((row) => {
    const context = String(row.payment_context || 'vote').toLowerCase()
    if (context === 'vote') {
      return Boolean(row.vote_id)
    }

    return Boolean(row.ticket_id)
  })

  if (paymentRows.length === 0) {
    return { inserted: 0 }
  }

  const paymentIds = paymentRows.map((row) => String(row.id || '')).filter(Boolean)

  const { data: existingRows, error: existingError } = await adminSupabase
    .from('admin_revenue_transactions')
    .select('payment_id')
    .in('payment_id', paymentIds)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingPaymentIds = new Set(
    ((existingRows || []) as Array<Record<string, unknown>>)
      .map((row) => String(row.payment_id || ''))
      .filter(Boolean)
  )

  const missingPaymentRows = paymentRows.filter((row) => !existingPaymentIds.has(String(row.id || '')))

  if (missingPaymentRows.length === 0) {
    return { inserted: 0 }
  }

  const eventIds = Array.from(new Set(missingPaymentRows.map((row) => String(row.event_id || '')).filter(Boolean)))

  const { data: eventRows, error: eventError } = await adminSupabase
    .from('events')
    .select('id,title,organizer_id')
    .in('id', eventIds)

  if (eventError) {
    throw new Error(eventError.message)
  }

  const eventById = new Map<string, Record<string, unknown>>()
  for (const row of (eventRows || []) as Array<Record<string, unknown>>) {
    eventById.set(String(row.id || ''), row)
  }

  const feePercentCache = new Map<string, number>()

  const rowsToInsert: Array<Record<string, unknown>> = []

  for (const payment of missingPaymentRows) {
    const paymentId = String(payment.id || '').trim()
    const eventId = String(payment.event_id || '').trim()

    if (!paymentId || !eventId) {
      continue
    }

    const eventRow = eventById.get(eventId)
    const organizerRef = toStringOrNull(eventRow?.organizer_id)
    const paymentContext = String(payment.payment_context || 'vote').toLowerCase() === 'ticket' ? 'ticket' : 'vote'

    const feeCacheKey = `${paymentContext}:${organizerRef || '__default__'}`
    let feePercent = feePercentCache.get(feeCacheKey)
    if (feePercent == null) {
      feePercent = await resolveAdminRevenueFeePercent(adminSupabase, paymentContext, organizerRef)
      feePercentCache.set(feeCacheKey, feePercent)
    }

    const grossAmount = Number(toNumber(payment.amount).toFixed(2))
    if (grossAmount <= 0) {
      continue
    }

    const platformFeeAmount = Number(((grossAmount * feePercent) / 100).toFixed(2))
    const organizerNetAmount = Number((grossAmount - platformFeeAmount).toFixed(2))
    const paymentProvider = normalizeStoredPaymentProvider(payment.reference, payment.provider)

    rowsToInsert.push({
      payment_id: paymentId,
      payment_reference: toStringOrNull(payment.reference),
      event_id: eventId,
      event_title: toStringOrNull(eventRow?.title),
      organizer_id: organizerRef,
      vote_id: paymentContext === 'vote' ? toStringOrNull(payment.vote_id) : null,
      vote_type: 'paid',
      payment_context: paymentContext,
      payment_provider: paymentProvider,
      gross_amount: grossAmount,
      platform_fee_percent: Number(feePercent.toFixed(2)),
      platform_fee_amount: platformFeeAmount,
      organizer_net_amount: organizerNetAmount,
      processed_at:
        toStringOrNull(payment.processed_at) ||
        toStringOrNull(payment.verified_at) ||
        toStringOrNull(payment.updated_at) ||
        toStringOrNull(payment.created_at) ||
        new Date().toISOString(),
    })
  }

  if (rowsToInsert.length === 0) {
    return { inserted: 0 }
  }

  const { error: insertError } = await adminSupabase
    .from('admin_revenue_transactions')
    .upsert(rowsToInsert, { onConflict: 'payment_id', ignoreDuplicates: true })

  if (insertError) {
    throw new Error(insertError.message)
  }

  return { inserted: rowsToInsert.length }
}
