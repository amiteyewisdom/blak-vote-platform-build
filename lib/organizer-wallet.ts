import { SUPPORT_EMAIL, buildSupportWhatsAppHref } from '@/lib/support-contact'

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
  gross_revenue: number
  vote_revenue: number
  ticket_revenue: number
  total_paid_votes: number
  manual_votes: number
  paid_ticket_count: number
  platform_fees_deducted: number
  vote_platform_fees_deducted: number
  ticket_platform_fees_deducted: number
  net_balance: number
  // Per-type organizer net earnings
  voting_earnings: number
  ticket_earnings: number
  total_earnings: number
  // Spendable balance fields (stored atomically post-migration)
  withdrawable_balance: number
  pending_balance: number
  total_withdrawn: number
  // Legacy computed balance
  available_balance: number
  pending_withdrawals: number
  total_cashed_out: number
  transferable_balance: number
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
  event_id: string | null
  amount_requested: number
  platform_fee_percent: number
  platform_fee_amount: number
  net_amount: number
  method: string
  account_details: Record<string, unknown> | null
  withdrawal_type: string
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
const PAID_PAYMENT_STATUSES = ['processed', 'success', 'paid', 'completed']

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

function positiveFee(...candidates: Array<unknown>): number {
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 10
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

  return positiveFee(feeResult, feeOverride?.platform_fee_percent, globalSettings?.platform_fee_percent)
}

async function resolveEffectiveTicketingFeePercent(adminSupabase: SupabaseLike, userId: string) {
  const [{ data: feeOverride }, { data: globalSettings }, { data: feeResult }] = await Promise.all([
    adminSupabase
      .from('organizer_fee_overrides')
      .select('ticketing_fee_percent')
      .eq('organizer_user_id', userId)
      .maybeSingle(),
    adminSupabase
      .from('platform_settings')
      .select('ticketing_commission_percent, platform_fee_percent')
      .limit(1)
      .maybeSingle(),
    adminSupabase.rpc('get_effective_ticketing_fee_percent', {
      p_organizer_ref: userId,
    }),
  ])

  return positiveFee(
    feeResult,
    feeOverride?.ticketing_fee_percent,
    globalSettings?.ticketing_commission_percent,
    globalSettings?.platform_fee_percent,
  )
}

async function buildOrganizerEventMetrics(adminSupabase: SupabaseLike, userId: string) {
  const refs = await resolveOrganizerRefs(adminSupabase, userId)
  const globalVoteFee = await resolveEffectivePlatformFeePercent(adminSupabase, userId)
  const globalTicketingFee = await resolveEffectiveTicketingFeePercent(adminSupabase, userId)

  const { data: eventRows, error: eventsError } = await adminSupabase
    .from('events')
    .select('id,title,organizer_id,updated_at,status,event_type,vote_platform_fee_percent,ticketing_fee_percent')
    .in('organizer_id', refs.aliases)

  if (eventsError) {
    throw new Error(eventsError.message)
  }

  const events = (eventRows || []) as Array<{
    id: string
    title?: string | null
    organizer_id?: string | null
    updated_at?: string | null
    status?: string | null
    event_type?: string | null
    vote_platform_fee_percent?: number | null
    ticketing_fee_percent?: number | null
  }>

  const activeEvents = events.filter((event) => {
    const status = String(event.status || '').toLowerCase()
    return status !== 'deleted' && status !== 'cancelled'
  })

  const eventIds = activeEvents.map((event) => String(event.id))
  const metrics = new Map<string, {
    event_id: string
    event_title: string
    event_type: string
    total_votes: number
    paid_votes: number
    free_votes: number
    manual_votes: number
    paid_ticket_count: number
    total_revenue: number
    vote_revenue: number
    ticket_revenue: number
    platform_fee_percent: number
    vote_fee_percent: number
    ticket_fee_percent: number
    platform_fee_deducted: number
    vote_platform_fee_deducted: number
    ticket_platform_fee_deducted: number
    net_earnings: number
    vote_net_earnings: number
    ticket_net_earnings: number
    cashed_out_amount: number
    revenue_left: number
    withdrawn_vote_revenue: number
    withdrawn_ticket_revenue: number
    updated_at: string
  }>()

  for (const event of activeEvents) {
    const voteFee = Number(event.vote_platform_fee_percent ?? globalVoteFee)
    const ticketFee = Number(event.ticketing_fee_percent ?? globalTicketingFee)
    const overallFee = event.event_type === 'ticketing' ? ticketFee : voteFee

    metrics.set(String(event.id), {
      event_id: String(event.id),
      event_title: event.title || 'Untitled event',
      event_type: event.event_type || 'voting',
      total_votes: 0,
      paid_votes: 0,
      free_votes: 0,
      manual_votes: 0,
      paid_ticket_count: 0,
      total_revenue: 0,
      vote_revenue: 0,
      ticket_revenue: 0,
      platform_fee_percent: overallFee,
      vote_fee_percent: voteFee,
      ticket_fee_percent: ticketFee,
      platform_fee_deducted: 0,
      vote_platform_fee_deducted: 0,
      ticket_platform_fee_deducted: 0,
      net_earnings: 0,
      vote_net_earnings: 0,
      ticket_net_earnings: 0,
      cashed_out_amount: 0,
      revenue_left: 0,
      withdrawn_vote_revenue: 0,
      withdrawn_ticket_revenue: 0,
      updated_at: event.updated_at || new Date().toISOString(),
    })
  }

  if (eventIds.length === 0) {
    return Array.from(metrics.values())
  }

  const [{ data: voteRows, error: votesError }, { data: ticketPaymentRows, error: ticketError }, { data: feeRows, error: feeError }, { data: withdrawalRows, error: withdrawalError }] = await Promise.all([
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
      .select('event_id,payment_context,platform_fee_amount,platform_fee_percent,gross_amount,processed_at')
      .in('event_id', eventIds),
    adminSupabase
      .from('organizer_withdrawals')
      .select('event_id,amount_requested,withdrawal_type,status')
      .eq('organizer_id', userId)
      .in('status', ['pending', 'approved', 'processed'])
      .not('event_id', 'is', null),
  ])

  if (votesError) throw new Error(votesError.message)
  if (ticketError) throw new Error(ticketError.message)
  if (feeError) throw new Error(feeError.message)
  if (withdrawalError) throw new Error(withdrawalError.message)

  for (const row of (voteRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) continue

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
    if (createdAt && createdAt > metric.updated_at) metric.updated_at = createdAt
  }

  for (const row of (ticketPaymentRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) continue

    metric.paid_ticket_count += Math.max(toNumber(row.quantity), 1)
    metric.ticket_revenue += toNumber(row.amount)

    const createdAt = typeof row.created_at === 'string' ? row.created_at : ''
    if (createdAt && createdAt > metric.updated_at) metric.updated_at = createdAt
  }

  for (const row of (feeRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) continue

    const storedFeeAmount  = toNumber(row.platform_fee_amount)
    const storedFeePercent = toNumber(row.platform_fee_percent)
    const grossAmount      = toNumber(row.gross_amount)
    const paymentContext   = String(row.payment_context || 'vote').toLowerCase()

    // If the stored fee amount is 0 but we have the gross and a non-zero percent,
    // recompute on the fly (guards against the Number(null)=0 historical bug).
    let feeAmount = storedFeeAmount
    if (feeAmount === 0 && grossAmount > 0) {
      if (storedFeePercent > 0) {
        feeAmount = Number((grossAmount * storedFeePercent / 100).toFixed(2))
      } else {
        // Last-resort: use the event's currently configured fee percent
        feeAmount = Number((grossAmount * toNumber(metric.platform_fee_percent) / 100).toFixed(2))
      }
    }

    if (paymentContext === 'ticket') {
      metric.ticket_platform_fee_deducted += feeAmount
    } else {
      metric.vote_platform_fee_deducted += feeAmount
    }

    const processedAt = typeof row.processed_at === 'string' ? row.processed_at : ''
    if (processedAt && processedAt > metric.updated_at) metric.updated_at = processedAt
  }

  for (const row of (withdrawalRows || []) as Array<Record<string, unknown>>) {
    const eventId = String(row.event_id || '')
    const metric = metrics.get(eventId)
    if (!metric) continue

    const amount = toNumber(row.amount_requested)
    const wType = String(row.withdrawal_type || 'combined').toLowerCase()
    if (wType === 'vote') {
      metric.withdrawn_vote_revenue += amount
    } else if (wType === 'ticket') {
      metric.withdrawn_ticket_revenue += amount
    } else {
      metric.withdrawn_vote_revenue += amount
    }
  }

  return Array.from(metrics.values()).map((metric) => {
    metric.total_revenue = metric.vote_revenue + metric.ticket_revenue

    // Compute fee deductions directly from gross revenue × effective fee percent.
    // This is reliable regardless of what admin_revenue_transactions contains,
    // handling the case where stored platform_fee_amount = 0 due to a historical bug.
    metric.vote_platform_fee_deducted = Number(
      (metric.vote_revenue * metric.vote_fee_percent / 100).toFixed(2)
    )
    metric.ticket_platform_fee_deducted = Number(
      (metric.ticket_revenue * metric.ticket_fee_percent / 100).toFixed(2)
    )

    metric.platform_fee_deducted = metric.vote_platform_fee_deducted + metric.ticket_platform_fee_deducted
    metric.vote_net_earnings = Number((metric.vote_revenue - metric.vote_platform_fee_deducted).toFixed(2))
    metric.ticket_net_earnings = Number((metric.ticket_revenue - metric.ticket_platform_fee_deducted).toFixed(2))
    metric.net_earnings = Number((metric.vote_net_earnings + metric.ticket_net_earnings).toFixed(2))
    metric.cashed_out_amount = Number((metric.withdrawn_vote_revenue + metric.withdrawn_ticket_revenue).toFixed(2))
    metric.revenue_left = Number(Math.max(metric.net_earnings - metric.cashed_out_amount, 0).toFixed(2))
    return metric
  })
}

async function getOrganizerProcessedWithdrawalTotal(adminSupabase: SupabaseLike, userId: string) {
  const { data: processedRows, error } = await adminSupabase
    .from('organizer_withdrawals')
    .select('amount_requested')
    .eq('organizer_id', userId)
    .eq('status', 'processed')

  if (error) {
    throw new Error(error.message)
  }

  return (processedRows || []).reduce(
    (sum: number, row: { amount_requested?: number | null }) => sum + toNumber(row.amount_requested),
    0,
  )
}

function distributeProcessedWithdrawalsAcrossEvents(
  metrics: Array<Record<string, unknown>>,
  organizerProcessedWithdrawals: number,
) {
  const cappedProcessedTotal = Math.max(toNumber(organizerProcessedWithdrawals), 0)
  const totalNetEarnings = metrics.reduce(
    (sum, metric) => sum + Math.max(toNumber(metric.net_earnings), 0),
    0,
  )

  if (cappedProcessedTotal <= 0 || totalNetEarnings <= 0 || metrics.length === 0) {
    return metrics.map((metric) => {
      const net = Math.max(toNumber(metric.net_earnings), 0)
      return {
        ...metric,
        cashed_out_amount: 0,
        revenue_left: net,
      }
    })
  }

  const maxAllocatable = Math.min(cappedProcessedTotal, totalNetEarnings)
  let allocatedRunningTotal = 0

  return metrics.map((metric, index) => {
    const net = Math.max(toNumber(metric.net_earnings), 0)

    let cashedOut = 0
    if (index === metrics.length - 1) {
      cashedOut = Number(Math.max(maxAllocatable - allocatedRunningTotal, 0).toFixed(2))
    } else {
      const rawShare = (net / totalNetEarnings) * maxAllocatable
      cashedOut = Number(rawShare.toFixed(2))
      allocatedRunningTotal += cashedOut
    }

    if (cashedOut > net) {
      cashedOut = net
    }

    const revenueLeft = Number(Math.max(net - cashedOut, 0).toFixed(2))

    return {
      ...metric,
      cashed_out_amount: cashedOut,
      revenue_left: revenueLeft,
    }
  })
}

export async function getOrganizerWalletSummaryData(adminSupabase: SupabaseLike, userId: string): Promise<WalletSummaryData> {
  const eventMetrics = await buildOrganizerEventMetrics(adminSupabase, userId)

  const [{ data: pendingRows, error: pendingError }, processedWithdrawals, { data: walletRow }] = await Promise.all([
    adminSupabase
      .from('organizer_withdrawals')
      .select('amount_requested,status')
      .eq('organizer_id', userId)
      .in('status', WITHDRAWAL_PENDING_STATUSES),
    getOrganizerProcessedWithdrawalTotal(adminSupabase, userId),
    adminSupabase
      .from('organizer_wallets')
      .select('transferable_balance,withdrawable_balance,pending_balance,total_withdrawn,voting_earnings,ticket_earnings,total_earnings')
      .eq('organizer_id', userId)
      .maybeSingle(),
  ])

  if (pendingError) {
    throw new Error(pendingError.message)
  }

  const pendingWithdrawals = (pendingRows || []).reduce(
    (sum: number, row: { amount_requested?: number | null }) => sum + toNumber(row.amount_requested),
    0,
  )

  const transferableBalance = toNumber(walletRow?.transferable_balance)

  const summary = eventMetrics.reduce(
    (accumulator: WalletSummaryData, row: any) => {
      accumulator.total_revenue += toNumber(row.total_revenue)
      accumulator.vote_revenue += toNumber(row.vote_revenue)
      accumulator.ticket_revenue += toNumber(row.ticket_revenue)
      accumulator.total_paid_votes += toNumber(row.paid_votes)
      accumulator.manual_votes += toNumber(row.manual_votes)
      accumulator.paid_ticket_count += toNumber(row.paid_ticket_count)
      accumulator.platform_fees_deducted += toNumber(row.platform_fee_deducted)
      accumulator.vote_platform_fees_deducted += toNumber(row.vote_platform_fee_deducted)
      accumulator.ticket_platform_fees_deducted += toNumber(row.ticket_platform_fee_deducted)
      accumulator.net_balance += toNumber(row.net_earnings)

      const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : ''
      if (updatedAt && updatedAt > accumulator.last_updated) {
        accumulator.last_updated = updatedAt
      }

      return accumulator
    },
    {
      total_revenue: 0,
      gross_revenue: 0,
      vote_revenue: 0,
      ticket_revenue: 0,
      total_paid_votes: 0,
      manual_votes: 0,
      paid_ticket_count: 0,
      platform_fees_deducted: 0,
      vote_platform_fees_deducted: 0,
      ticket_platform_fees_deducted: 0,
      net_balance: 0,
      voting_earnings: 0,
      ticket_earnings: 0,
      total_earnings: 0,
      withdrawable_balance: 0,
      pending_balance: 0,
      total_withdrawn: 0,
      available_balance: 0,
      pending_withdrawals: 0,
      total_cashed_out: 0,
      transferable_balance: 0,
      last_updated: new Date(0).toISOString(),
    },
  )

  summary.gross_revenue = summary.total_revenue
  summary.pending_withdrawals = pendingWithdrawals
  summary.total_cashed_out = Number(processedWithdrawals.toFixed(2))
  summary.transferable_balance = transferableBalance
  summary.available_balance = Math.max(summary.net_balance - pendingWithdrawals + transferableBalance, 0)

  // Merge stored atomic fields from organizer_wallets when available.
  const storedWithdrawable = toNumber(walletRow?.withdrawable_balance)
  summary.withdrawable_balance = storedWithdrawable > 0
    ? storedWithdrawable
    : summary.available_balance
  summary.pending_balance   = toNumber(walletRow?.pending_balance)
  summary.total_withdrawn   = toNumber(walletRow?.total_withdrawn)
  summary.voting_earnings   = toNumber(walletRow?.voting_earnings)
  summary.ticket_earnings   = toNumber(walletRow?.ticket_earnings)
  summary.total_earnings    = toNumber(walletRow?.total_earnings) || summary.net_balance

  if (summary.last_updated === new Date(0).toISOString()) {
    summary.last_updated = new Date().toISOString()
  }

  return summary
}

export async function getOrganizerEventEarningsData(adminSupabase: SupabaseLike, userId: string) {
  const metrics = await buildOrganizerEventMetrics(adminSupabase, userId)
  const processedWithdrawals = await getOrganizerProcessedWithdrawalTotal(adminSupabase, userId)
  const withCashedOut = distributeProcessedWithdrawalsAcrossEvents(metrics, processedWithdrawals)

  return withCashedOut.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
}

export async function getOrganizerWithdrawalHistoryData(
  adminSupabase: SupabaseLike,
  userId: string,
  limit: number,
  offset: number,
) {
  const { data, error } = await adminSupabase
    .from('organizer_withdrawals')
    .select('id,event_id,amount_requested,platform_fee_percent,platform_fee_amount,net_amount,method,account_details,withdrawal_type,status,admin_note,requested_at,approved_at,processed_at,payout_provider,payout_reference,payout_recipient_code,payout_attempted_at,payout_failure_reason,payout_metadata,created_at')
    .eq('organizer_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as OrganizerWithdrawalRow[]
}

const WITHDRAWAL_SELECT_COLUMNS =
  'id,event_id,amount_requested,platform_fee_percent,platform_fee_amount,net_amount,method,account_details,withdrawal_type,status,admin_note,requested_at,approved_at,processed_at,payout_provider,payout_reference,payout_recipient_code,payout_attempted_at,payout_failure_reason,payout_metadata,created_at'

export async function createOrganizerWithdrawalRequest(
  adminSupabase: SupabaseLike,
  userId: string,
  input: {
    amount: number
    method: string
    accountDetails: Record<string, unknown>
    platformFeePercent: number
    eventId?: string | null
    withdrawalType?: 'vote' | 'ticket' | 'combined'
    orphanedEventIds?: string[]
  },
) {
  const amount = Number(Math.max(toNumber(input.amount), 0).toFixed(2))
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive')
  }

  // Embed orphaned event IDs into account_details so the admin panel / payout
  // processor can zero-out each deleted event's revenue_left after approval.
  const storedAccountDetails: Record<string, unknown> = { ...input.accountDetails }
  if (input.orphanedEventIds && input.orphanedEventIds.length > 0) {
    storedAccountDetails._orphaned_event_ids = input.orphanedEventIds
  }

  // ── Primary path: atomic RPC with row-level lock ──────────────────────────
  // Requires migration 20260526000000_enterprise_accounting_ledger to be deployed.
  const { data: rpcData, error: rpcError } = await adminSupabase.rpc(
    'process_organizer_withdrawal',
    {
      p_organizer_id:    userId,
      p_amount:          amount,
      p_method:          input.method,
      p_account_details: storedAccountDetails,
      p_event_id:        input.eventId || null,
      p_withdrawal_type: input.withdrawalType || 'combined',
    },
  )

  if (!rpcError && rpcData) {
    const result = rpcData as { withdrawal_id: number }
    const { data: withdrawalRow } = await adminSupabase
      .from('organizer_withdrawals')
      .select(WITHDRAWAL_SELECT_COLUMNS)
      .eq('id', result.withdrawal_id)
      .maybeSingle()
    return withdrawalRow as OrganizerWithdrawalRow | null
  }

  // If RPC definitively rejected with a domain error (insufficient balance,
  // wallet not found), do NOT fall through — surface the error immediately.
  if (rpcError) {
    const msg = String(rpcError.message || '').toLowerCase()
    const isFunctionMissing =
      msg.includes('function') ||
      msg.includes('does not exist') ||
      msg.includes('could not find')

    if (!isFunctionMissing) {
      throw new Error(rpcError.message)
    }

    console.warn('[ACCOUNTING] process_organizer_withdrawal RPC not available, using legacy fallback:', rpcError.message)
  }

  // ── Fallback: legacy path (migration not yet deployed) ───────────────────
  const wallet = await getOrganizerWalletSummaryData(adminSupabase, userId)
  if (amount > wallet.available_balance) {
    throw new Error('Insufficient available balance')
  }

  const feePercent = Math.max(toNumber(input.platformFeePercent), 0)
  const { data, error } = await adminSupabase
    .from('organizer_withdrawals')
    .insert({
      organizer_id:         userId,
      event_id:             input.eventId || null,
      amount_requested:     amount,
      platform_fee_percent: feePercent,
      platform_fee_amount:  0,
      net_amount:           amount,
      method:               input.method,
      account_details:      storedAccountDetails,
      withdrawal_type:      input.withdrawalType || 'combined',
      status:               'pending',
      requested_at:         new Date().toISOString(),
    })
    .select(WITHDRAWAL_SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as OrganizerWithdrawalRow | null
}

export async function sendWithdrawalConfirmationEmail(
  email: string,
  organizerName: string | undefined,
  withdrawalData: {
    amount_requested: number
    net_amount: number
    platform_fee_percent: number
    platform_fee_amount: number
    method: string
    account_details?: Record<string, unknown> | null
  }
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured, skipping withdrawal confirmation email')
    return
  }

  const from = process.env.OTP_FROM_EMAIL || 'BlakVote <noreply@mail.blakvote.com>'
  const greeting = organizerName ? `Hi ${organizerName.split(' ')[0]},` : 'Hello,'
  const methodDisplay = withdrawalData.method === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const accountNumber = withdrawalData.account_details
    ? (withdrawalData.account_details.account_number || withdrawalData.account_details.phone_number || 'Your account')
    : 'Your account'

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Withdrawal Request Confirmation</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .status-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #666; font-size: 14px; }
        .detail-value { font-weight: 600; color: #000; }
        .amount { font-size: 18px; font-weight: bold; color: #10b981; }
        .timeline { margin-top: 20px; }
        .timeline-step { padding: 10px 0; padding-left: 30px; position: relative; }
        .timeline-step:before { content: '✓'; position: absolute; left: 0; color: #10b981; font-weight: bold; }
        .timeline-step.pending:before { content: '→'; color: #f59e0b; }
        .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #1f2937; margin: 0;">BlakVote</h1>
          <p style="color: #6b7280; margin: 5px 0 0 0;">Withdrawal Confirmation</p>
        </div>

        <p>${greeting}</p>
        <p>Your withdrawal request has been successfully submitted for admin review.</p>

        <div class="status-box">
          <strong>Status:</strong> <em>Pending Admin Approval</em><br>
          <small>Your request is now in the queue for administrator validation. Once approved, the system will automatically process your payout.</small>
        </div>

        <div class="card">
          <h3 style="margin-top: 0; color: #1f2937;">Withdrawal Details</h3>
          <div class="detail-row">
            <span class="detail-label">Requested Amount</span>
            <span class="detail-value amount">GHS ${withdrawalData.amount_requested.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Platform Fee</span>
            <span class="detail-value">GHS ${withdrawalData.platform_fee_amount.toFixed(2)} (${withdrawalData.platform_fee_percent}%)</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">You Will Receive</span>
            <span class="detail-value amount">GHS ${withdrawalData.net_amount.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">${methodDisplay}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Destination</span>
            <span class="detail-value">${accountNumber}</span>
          </div>
        </div>

        <div class="timeline">
          <h3 style="color: #1f2937; margin-bottom: 15px;">What Happens Next</h3>
          <div class="timeline-step">✓ Your withdrawal request has been submitted</div>
          <div class="timeline-step pending">→ An administrator will review and approve your request</div>
          <div class="timeline-step pending">→ Upon approval, the system will process your payout automatically</div>
          <div class="timeline-step pending">→ You will receive funds in your account within 1-2 business days</div>
        </div>

        <p style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 6px; font-size: 14px;">
          <strong>💡 Tip:</strong> You can track your withdrawal status in the BlakVote dashboard under "Wallet" → "Withdrawal History". We'll notify you if any additional information is needed.
        </p>

        <div class="footer">
          <p>Questions? Contact us at support@blakvote.com or reach out through WhatsApp.</p>
          <p>&copy; 2026 BlakVote. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Withdrawal Request Confirmation - GHS ${withdrawalData.net_amount.toFixed(2)} Pending Approval`,
        html,
      }),
    })

    if (!response.ok) {
      console.error(`Failed to send withdrawal confirmation email: ${response.status}`)
    }
  } catch (error) {
    console.error('Error sending withdrawal confirmation email:', error)
  }
}

export async function sendAdminWithdrawalInitiatedNotification(input: {
  withdrawalId: number
  organizerId: string
  organizerEmail: string | null
  organizerName?: string
  amountRequested: number
  netAmount: number
  method: string
  requestedAt?: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_ALERT_EMAIL?.trim() || SUPPORT_EMAIL
  const from = process.env.OTP_FROM_EMAIL || 'BlakVote <noreply@mail.blakvote.com>'
  const methodDisplay = input.method === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const requestedAt = input.requestedAt ? new Date(input.requestedAt) : new Date()
  const whatsappHref = buildSupportWhatsAppHref(
    `Withdrawal approval needed:\n- Withdrawal ID: ${input.withdrawalId}\n- Organizer: ${input.organizerName || input.organizerId}\n- Amount: GHS ${input.netAmount.toFixed(2)}\nPlease review in admin dashboard.`
  )

  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured, skipping admin withdrawal notification email')
    console.info(`Admin WhatsApp escalation link: ${whatsappHref}`)
    return
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Organizer Withdrawal Pending Approval</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; color: #111827; }
        .container { max-width: 620px; margin: 0 auto; padding: 20px; }
        .header { margin-bottom: 20px; }
        .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
        .row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .row:last-child { border-bottom: none; }
        .label { color: #6b7280; font-size: 13px; }
        .value { font-weight: 600; text-align: right; }
        .cta-wrap { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
        .btn { display: inline-block; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; }
        .btn-email { background: #0f172a; color: #ffffff !important; }
        .btn-wa { background: #16a34a; color: #ffffff !important; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Organizer withdrawal pending approval</h2>
          <p style="margin: 6px 0 0 0; color: #6b7280;">A new payout request needs admin review.</p>
        </div>
        <div class="card">
          <div class="row"><span class="label">Withdrawal ID</span><span class="value">${input.withdrawalId}</span></div>
          <div class="row"><span class="label">Organizer</span><span class="value">${input.organizerName || input.organizerId}</span></div>
          <div class="row"><span class="label">Organizer Email</span><span class="value">${input.organizerEmail || 'Not found'}</span></div>
          <div class="row"><span class="label">Requested Amount</span><span class="value">GHS ${input.amountRequested.toFixed(2)}</span></div>
          <div class="row"><span class="label">Net Amount</span><span class="value">GHS ${input.netAmount.toFixed(2)}</span></div>
          <div class="row"><span class="label">Method</span><span class="value">${methodDisplay}</span></div>
          <div class="row"><span class="label">Requested At</span><span class="value">${requestedAt.toISOString()}</span></div>
        </div>
        <div class="cta-wrap">
          <a class="btn btn-email" href="mailto:${adminEmail}?subject=${encodeURIComponent(`Withdrawal Approval Needed #${input.withdrawalId}`)}">Open Admin Email</a>
          <a class="btn btn-wa" href="${whatsappHref}">Open Admin WhatsApp</a>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [adminEmail],
        subject: `Withdrawal Approval Needed #${input.withdrawalId} (GHS ${input.netAmount.toFixed(2)})`,
        html,
      }),
    })

    if (!response.ok) {
      console.error(`Failed to send admin withdrawal notification email: ${response.status}`)
    }
  } catch (error) {
    console.error('Error sending admin withdrawal notification email:', error)
  }
}

export async function sendWithdrawalApprovalEmail(
  email: string,
  organizerName: string | undefined,
  withdrawalData: {
    amount_requested: number
    net_amount: number
    platform_fee_percent: number
    platform_fee_amount: number
    method: string
    account_details?: Record<string, unknown> | null
  }
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured, skipping withdrawal approval email')
    return
  }

  const from = process.env.OTP_FROM_EMAIL || 'BlakVote <noreply@mail.blakvote.com>'
  const greeting = organizerName ? `Hi ${organizerName.split(' ')[0]},` : 'Hello,'
  const methodDisplay = withdrawalData.method === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const accountNumber = withdrawalData.account_details
    ? (withdrawalData.account_details.account_number || withdrawalData.account_details.phone_number || 'Your account')
    : 'Your account'

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Withdrawal Request Approved</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .status-box { background: #dcfce7; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #666; font-size: 14px; }
        .detail-value { font-weight: 600; color: #000; }
        .amount { font-size: 18px; font-weight: bold; color: #10b981; }
        .timeline { margin-top: 20px; }
        .timeline-step { padding: 10px 0; padding-left: 30px; position: relative; }
        .timeline-step:before { content: '✓'; position: absolute; left: 0; color: #10b981; font-weight: bold; }
        .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #1f2937; margin: 0;">BlakVote</h1>
          <p style="color: #6b7280; margin: 5px 0 0 0;">Withdrawal Approved ✓</p>
        </div>

        <p>${greeting}</p>
        <p>Great news! Your withdrawal request has been reviewed and approved by our administrators.</p>

        <div class="status-box">
          <strong style="color: #166534;">✓ Approved</strong><br>
          <small>Your withdrawal is now being processed. The system will automatically send your funds to your account. This typically takes 1-2 business days.</small>
        </div>

        <div class="card">
          <h3 style="margin-top: 0; color: #1f2937;">Withdrawal Details</h3>
          <div class="detail-row">
            <span class="detail-label">Requested Amount</span>
            <span class="detail-value amount">GHS ${withdrawalData.amount_requested.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Platform Fee</span>
            <span class="detail-value">GHS ${withdrawalData.platform_fee_amount.toFixed(2)} (${withdrawalData.platform_fee_percent}%)</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">You Will Receive</span>
            <span class="detail-value amount">GHS ${withdrawalData.net_amount.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">${methodDisplay}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Destination</span>
            <span class="detail-value">${accountNumber}</span>
          </div>
        </div>

        <div class="timeline">
          <h3 style="color: #1f2937; margin-bottom: 15px;">Processing Timeline</h3>
          <div class="timeline-step">✓ Your withdrawal request has been submitted</div>
          <div class="timeline-step">✓ Your request has been approved</div>
          <div class="timeline-step">✓ The system is processing your payout</div>
          <div class="timeline-step">✓ Funds will arrive in 1-2 business days</div>
        </div>

        <p style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 6px; font-size: 14px;">
          <strong>📊 Track Your Withdrawal:</strong> Check the status anytime in your BlakVote dashboard under "Wallet" → "Withdrawal History".
        </p>

        <div class="footer">
          <p>Questions? Contact us at support@blakvote.com or reach out through WhatsApp.</p>
          <p>&copy; 2026 BlakVote. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `✓ Withdrawal Approved - GHS ${withdrawalData.net_amount.toFixed(2)} Being Processed`,
        html,
      }),
    })

    if (!response.ok) {
      console.error(`Failed to send withdrawal approval email: ${response.status}`)
    }
  } catch (error) {
    console.error('Error sending withdrawal approval email:', error)
  }
}
