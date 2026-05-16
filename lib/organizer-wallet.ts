type SupabaseLike = {
  from: (table: string) => any
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>
}

type OrganizerRefs = {
  userId: string
  organizerRecordId: string | null
  aliases: string[]
}

type WalletSummaryData = {
  total_revenue: number
  vote_revenue: number
  ticket_revenue: number
  total_paid_votes: number
  manual_votes: number
  paid_ticket_count: number
  platform_fees_deducted: number
  vote_platform_fees_deducted: number
  ticket_platform_fees_deducted: number
  net_balance: number
  available_balance: number
  pending_withdrawals: number
  last_updated: string
}

type OrganizerEventEarningRow = {
  organizer_id: string
  event_id: string
  total_votes: number | null
  paid_votes: number | null
  free_votes: number | null
  manual_votes: number | null
  paid_ticket_count: number | null
  total_revenue: number | null
  vote_revenue: number | null
  ticket_revenue: number | null
  platform_fee_percent: number | null
  platform_fee_deducted: number | null
  vote_platform_fee_deducted: number | null
  ticket_platform_fee_deducted: number | null
  net_earnings: number | null
  updated_at: string | null
}

type OrganizerWithdrawalRow = {
  id: number
  amount_requested: number
  platform_fee_percent: number
  platform_fee_amount: number
  net_amount: number
  method: string
  account_details: Record<string, unknown> | null
  status: string
  admin_note: string | null
  requested_at: string
  approved_at: string | null
  processed_at: string | null
  payout_provider: string | null
  payout_reference: string | null
  payout_recipient_code: string | null
  payout_attempted_at: string | null
  payout_failure_reason: string | null
  payout_metadata: Record<string, unknown> | null
  created_at: string
}

const WITHDRAWAL_PENDING_STATUSES = ['pending', 'approved', 'pending_funds']
const PAID_PAYMENT_STATUSES = ['processed', 'success', 'paid']

function toNumber(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export async function resolveOrganizerRefs(adminSupabase: SupabaseLike, userId: string): Promise<OrganizerRefs> {
  const { data: organizerRow } = await adminSupabase
    .from('organizers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  const organizerRecordId = organizerRow?.id ? String(organizerRow.id) : null

  return {
    userId,
    organizerRecordId,
    aliases: uniqueValues([userId, organizerRecordId]),
  }
}

async function resolveEffectivePlatformFeePercent(adminSupabase: SupabaseLike, userId: string) {
  const [{ data: feeOverride }, { data: globalSettings }, { data: feeResult }] = await Promise.all([
    adminSupabase
      .from('organizer_fee_overrides')
      .select('platform_fee_percent')
      .eq('organizer_user_id', userId)
      .maybeSingle(),
    adminSupabase
      .from('platform_settings')
      .select('platform_fee_percent')
      .limit(1)
      .maybeSingle(),
    adminSupabase.rpc('get_effective_platform_fee_percent', {
      p_organizer_ref: userId,
    }),
  ])

  return Number(feeResult ?? feeOverride?.platform_fee_percent ?? globalSettings?.platform_fee_percent ?? 10)
}

async function buildOrganizerEventMetrics(adminSupabase: SupabaseLike, userId: string) {
  const refs = await resolveOrganizerRefs(adminSupabase, userId)
  const effectivePlatformFeePercent = await resolveEffectivePlatformFeePercent(adminSupabase, userId)

  const { data: eventRows, error: eventsError } = await adminSupabase
    .from('events')
    .select('id,title,organizer_id,updated_at')
    .in('organizer_id', refs.aliases)

  if (eventsError) {
    throw new Error(eventsError.message)
  }

  const events = (eventRows || []) as Array<{
    id: string
    title?: string | null
    organizer_id?: string | null
    updated_at?: string | null
  }>

  const eventIds = events.map((event) => String(event.id))
  const metrics = new Map<string, {
    event_id: string
    event_title: string
    total_votes: number
    paid_votes: number
    free_votes: number
    manual_votes: number
    paid_ticket_count: number
    total_revenue: number
    vote_revenue: number
    ticket_revenue: number
    platform_fee_percent: number
    platform_fee_deducted: number
    vote_platform_fee_deducted: number
    ticket_platform_fee_deducted: number
    net_earnings: number
    updated_at: string
  }>()

  for (const event of events) {
    metrics.set(String(event.id), {
      event_id: String(event.id),
      event_title: event.title || 'Untitled event',
      total_votes: 0,
      paid_votes: 0,
      free_votes: 0,
      manual_votes: 0,
      paid_ticket_count: 0,
      total_revenue: 0,
      vote_revenue: 0,
      ticket_revenue: 0,
      platform_fee_percent: effectivePlatformFeePercent,
      platform_fee_deducted: 0,
      vote_platform_fee_deducted: 0,
      ticket_platform_fee_deducted: 0,
      net_earnings: 0,
      updated_at: event.updated_at || new Date().toISOString(),
    })
  }

  if (eventIds.length === 0) {
    return Array.from(metrics.values())
  }

  const [{ data: voteRows, error: votesError }, { data: ticketPaymentRows, error: ticketError }, { data: feeRows, error: feeError }] = await Promise.all([
    adminSupabase
      .from('votes')
      .select('event_id,quantity,amount_paid,vote_type,created_at')
      .in('event_id', eventIds),
    adminSupabase
      .from('payments')
      .select('event_id,amount,quantity,created_at')
      .in('event_id', eventIds)
      .eq('payment_context', 'ticket')
      .in('status', PAID_PAYMENT_STATUSES),
    adminSupabase
      .from('admin_revenue_transactions')
      .select('event_id,payment_context,platform_fee_amount,processed_at')
      .in('event_id', eventIds),
  ])

  if (votesError) {
    throw new Error(votesError.message)
  }

  if (ticketError) {
    throw new Error(ticketError.message)
  }

  if (feeError) {
    throw new Error(feeError.message)
  }

  for (const row of (voteRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) {
      continue
    }

    const quantity = Math.max(toNumber(row.quantity), 0)
    const voteType = String(row.vote_type || '').toLowerCase()
    const amountPaid = toNumber(row.amount_paid)
    metric.total_votes += quantity

    if (voteType === 'paid') {
      metric.paid_votes += quantity
      metric.vote_revenue += amountPaid
    } else if (voteType === 'manual') {
      metric.manual_votes += quantity
    } else {
      metric.free_votes += quantity
    }

    const createdAt = typeof row.created_at === 'string' ? row.created_at : ''
    if (createdAt && createdAt > metric.updated_at) {
      metric.updated_at = createdAt
    }
  }

  for (const row of (ticketPaymentRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) {
      continue
    }

    metric.paid_ticket_count += Math.max(toNumber(row.quantity), 1)
    metric.ticket_revenue += toNumber(row.amount)

    const createdAt = typeof row.created_at === 'string' ? row.created_at : ''
    if (createdAt && createdAt > metric.updated_at) {
      metric.updated_at = createdAt
    }
  }

  for (const row of (feeRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) {
      continue
    }

    const feeAmount = toNumber(row.platform_fee_amount)
    const paymentContext = String(row.payment_context || 'vote').toLowerCase()
    if (paymentContext === 'ticket') {
      metric.ticket_platform_fee_deducted += feeAmount
    } else {
      metric.vote_platform_fee_deducted += feeAmount
    }

    const processedAt = typeof row.processed_at === 'string' ? row.processed_at : ''
    if (processedAt && processedAt > metric.updated_at) {
      metric.updated_at = processedAt
    }
  }

  return Array.from(metrics.values()).map((metric) => {
    metric.total_revenue = metric.vote_revenue + metric.ticket_revenue
    metric.platform_fee_deducted = metric.vote_platform_fee_deducted + metric.ticket_platform_fee_deducted

    if (metric.total_revenue > 0 && metric.platform_fee_deducted === 0) {
      metric.platform_fee_deducted = Number(((metric.total_revenue * metric.platform_fee_percent) / 100).toFixed(2))

      if (metric.vote_revenue > 0 && metric.ticket_revenue > 0) {
        metric.vote_platform_fee_deducted = Number(
          ((metric.platform_fee_deducted * metric.vote_revenue) / metric.total_revenue).toFixed(2)
        )
        metric.ticket_platform_fee_deducted = Number(
          (metric.platform_fee_deducted - metric.vote_platform_fee_deducted).toFixed(2)
        )
      } else if (metric.vote_revenue > 0) {
        metric.vote_platform_fee_deducted = metric.platform_fee_deducted
        metric.ticket_platform_fee_deducted = 0
      } else {
        metric.vote_platform_fee_deducted = 0
        metric.ticket_platform_fee_deducted = metric.platform_fee_deducted
      }
    }

    metric.net_earnings = Number((metric.total_revenue - metric.platform_fee_deducted).toFixed(2))
    return metric
  })
}

export async function getOrganizerWalletSummaryData(adminSupabase: SupabaseLike, userId: string): Promise<WalletSummaryData> {
  const eventMetrics = await buildOrganizerEventMetrics(adminSupabase, userId)

  const { data: pendingRows, error: pendingError } = await adminSupabase
    .from('organizer_withdrawals')
    .select('amount_requested,status')
    .eq('organizer_id', userId)
    .in('status', WITHDRAWAL_PENDING_STATUSES)

  if (pendingError) {
    throw new Error(pendingError.message)
  }

  const pendingWithdrawals = (pendingRows || []).reduce(
    (sum: number, row: { amount_requested?: number | null }) => sum + toNumber(row.amount_requested),
    0,
  )

  const summary = eventMetrics.reduce(
    (accumulator: WalletSummaryData, row: Record<string, unknown>) => {
      accumulator.total_revenue += toNumber(row.total_revenue)
      accumulator.vote_revenue += toNumber(row.vote_revenue)
      accumulator.ticket_revenue += toNumber(row.ticket_revenue)
      accumulator.total_paid_votes += toNumber(row.total_paid_votes)
      accumulator.manual_votes += toNumber(row.manual_votes)
      accumulator.paid_ticket_count += toNumber(row.paid_ticket_count)
      accumulator.platform_fees_deducted += toNumber(row.platform_fees_deducted)
      accumulator.vote_platform_fees_deducted += toNumber(row.vote_platform_fees_deducted)
      accumulator.ticket_platform_fees_deducted += toNumber(row.ticket_platform_fees_deducted)
      accumulator.net_balance += toNumber(row.net_balance)

      const updatedAt = typeof row.last_updated === 'string' ? row.last_updated : ''
      if (updatedAt && updatedAt > accumulator.last_updated) {
        accumulator.last_updated = updatedAt
      }

      return accumulator
    },
    {
      total_revenue: 0,
      vote_revenue: 0,
      ticket_revenue: 0,
      total_paid_votes: 0,
      manual_votes: 0,
      paid_ticket_count: 0,
      platform_fees_deducted: 0,
      vote_platform_fees_deducted: 0,
      ticket_platform_fees_deducted: 0,
      net_balance: 0,
      available_balance: 0,
      pending_withdrawals: 0,
      last_updated: new Date(0).toISOString(),
    },
  )

  summary.pending_withdrawals = pendingWithdrawals
  summary.available_balance = Math.max(summary.net_balance - pendingWithdrawals, 0)
  if (summary.last_updated === new Date(0).toISOString()) {
    summary.last_updated = new Date().toISOString()
  }

  return summary
}

export async function getOrganizerEventEarningsData(adminSupabase: SupabaseLike, userId: string) {
  const metrics = await buildOrganizerEventMetrics(adminSupabase, userId)

  return metrics.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
}

export async function getOrganizerWithdrawalHistoryData(
  adminSupabase: SupabaseLike,
  userId: string,
  limit: number,
  offset: number,
) {
  const { data, error } = await adminSupabase
    .from('organizer_withdrawals')
    .select('id,amount_requested,platform_fee_percent,platform_fee_amount,net_amount,method,account_details,status,admin_note,requested_at,approved_at,processed_at,payout_provider,payout_reference,payout_recipient_code,payout_attempted_at,payout_failure_reason,payout_metadata,created_at')
    .eq('organizer_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as OrganizerWithdrawalRow[]
}

export async function createOrganizerWithdrawalRequest(
  adminSupabase: SupabaseLike,
  userId: string,
  input: {
    amount: number
    method: string
    accountDetails: Record<string, unknown>
    platformFeePercent: number
  },
) {
  const wallet = await getOrganizerWalletSummaryData(adminSupabase, userId)

  if (input.amount > wallet.available_balance) {
    throw new Error('Insufficient available balance')
  }

  const feePercent = Math.max(toNumber(input.platformFeePercent), 0)
  const feeAmount = Number(((input.amount * feePercent) / 100).toFixed(2))
  const netAmount = Number(Math.max(input.amount - feeAmount, 0).toFixed(2))

  const { data, error } = await adminSupabase
    .from('organizer_withdrawals')
    .insert({
      organizer_id: userId,
      amount_requested: Number(input.amount.toFixed(2)),
      platform_fee_percent: feePercent,
      platform_fee_amount: feeAmount,
      net_amount: netAmount,
      method: input.method,
      account_details: input.accountDetails,
      status: 'pending',
      requested_at: new Date().toISOString(),
    })
    .select('id,amount_requested,platform_fee_percent,platform_fee_amount,net_amount,method,account_details,status,admin_note,requested_at,approved_at,processed_at,payout_provider,payout_reference,payout_recipient_code,payout_attempted_at,payout_failure_reason,payout_metadata,created_at')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as OrganizerWithdrawalRow | null
}
