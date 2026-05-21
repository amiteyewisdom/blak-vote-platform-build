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

async function resolveAdminRevenueFeePercent(adminSupabase: SupabaseLike, payment: Record<string, unknown>, paymentContext: string, organizerRef: string | null) {
  if (paymentContext === 'ticket') {
    const ticketId = String(payment.ticket_id || '').trim()
    if (ticketId) {
      const { data: ticketRow } = await adminSupabase
        .from('tickets')
        .select('price, admin_fee')
        .eq('id', ticketId)
        .maybeSingle()

      if (
        ticketRow &&
        Number.isFinite(Number(ticketRow.price)) &&
        Number(ticketRow.price) > 0 &&
        Number.isFinite(Number(ticketRow.admin_fee))
      ) {
        const feePercent = (Number(ticketRow.admin_fee) * 100) / Number(ticketRow.price)
        if (Number.isFinite(feePercent)) {
          return Number(feePercent.toFixed(2))
        }
      }
    }

    const { data: settings } = await adminSupabase
      .from('platform_settings')
      .select('ticketing_commission_percent, platform_fee_percent')
      .limit(1)
      .maybeSingle()

    const ticketFeePercent = Number(settings?.ticketing_commission_percent)
    if (Number.isFinite(ticketFeePercent)) {
      return ticketFeePercent
    }

    const platformFeePercent = Number(settings?.platform_fee_percent)
    return Number.isFinite(platformFeePercent) ? platformFeePercent : 10
  }

  const { data: rpcFee } = await adminSupabase.rpc('get_effective_platform_fee_percent', {
    p_organizer_ref: organizerRef,
  })

  if (Number.isFinite(Number(rpcFee))) {
    return Number(rpcFee)
  }

  const { data: platformSettings } = await adminSupabase
    .from('platform_settings')
    .select('platform_fee_percent')
    .limit(1)
    .maybeSingle()

  const feePercent = Number(platformSettings?.platform_fee_percent)
  return Number.isFinite(feePercent) ? feePercent : 10
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

    let feePercent = 10
    if (paymentContext === 'ticket') {
      feePercent = await resolveAdminRevenueFeePercent(adminSupabase, payment, paymentContext, organizerRef)
    } else {
      const feeCacheKey = organizerRef || '__default__'
      feePercent = feePercentCache.get(feeCacheKey)
      if (feePercent == null) {
        const { data: rpcFee } = await adminSupabase.rpc('get_effective_platform_fee_percent', {
          p_organizer_ref: organizerRef,
        })
        feePercent = Number.isFinite(Number(rpcFee)) ? Number(rpcFee) : 10
        feePercentCache.set(feeCacheKey, feePercent)
      }
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
