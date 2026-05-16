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

export async function getOrganizerWalletSummaryData(adminSupabase: SupabaseLike, userId: string): Promise<WalletSummaryData> {
  const refs = await resolveOrganizerRefs(adminSupabase, userId)

  const { data: walletRows, error: walletError } = await adminSupabase
    .from('organizer_wallets')
    .select('organizer_id,total_revenue,vote_revenue,ticket_revenue,total_paid_votes,manual_votes,paid_ticket_count,platform_fees_deducted,vote_platform_fees_deducted,ticket_platform_fees_deducted,net_balance,last_updated')
    .in('organizer_id', refs.aliases)

  if (walletError) {
    throw new Error(walletError.message)
  }

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

  const summary = (walletRows || []).reduce(
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
  const refs = await resolveOrganizerRefs(adminSupabase, userId)

  const { data: rows, error } = await adminSupabase
    .from('organizer_event_earnings')
    .select('organizer_id,event_id,total_votes,paid_votes,free_votes,manual_votes,paid_ticket_count,total_revenue,vote_revenue,ticket_revenue,platform_fee_percent,platform_fee_deducted,vote_platform_fee_deducted,ticket_platform_fee_deducted,net_earnings,updated_at')
    .in('organizer_id', refs.aliases)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const aggregated = new Map<string, OrganizerEventEarningRow>()

  for (const rawRow of (rows || []) as OrganizerEventEarningRow[]) {
    const eventId = String(rawRow.event_id)
    const existing = aggregated.get(eventId)

    if (!existing) {
      aggregated.set(eventId, {
        ...rawRow,
        event_id: eventId,
        total_votes: toNumber(rawRow.total_votes),
        paid_votes: toNumber(rawRow.paid_votes),
        free_votes: toNumber(rawRow.free_votes),
        manual_votes: toNumber(rawRow.manual_votes),
        paid_ticket_count: toNumber(rawRow.paid_ticket_count),
        total_revenue: toNumber(rawRow.total_revenue),
        vote_revenue: toNumber(rawRow.vote_revenue),
        ticket_revenue: toNumber(rawRow.ticket_revenue),
        platform_fee_percent: toNumber(rawRow.platform_fee_percent),
        platform_fee_deducted: toNumber(rawRow.platform_fee_deducted),
        vote_platform_fee_deducted: toNumber(rawRow.vote_platform_fee_deducted),
        ticket_platform_fee_deducted: toNumber(rawRow.ticket_platform_fee_deducted),
        net_earnings: toNumber(rawRow.net_earnings),
        updated_at: rawRow.updated_at,
      })
      continue
    }

    existing.total_votes = toNumber(existing.total_votes) + toNumber(rawRow.total_votes)
    existing.paid_votes = toNumber(existing.paid_votes) + toNumber(rawRow.paid_votes)
    existing.free_votes = toNumber(existing.free_votes) + toNumber(rawRow.free_votes)
    existing.manual_votes = toNumber(existing.manual_votes) + toNumber(rawRow.manual_votes)
    existing.paid_ticket_count = toNumber(existing.paid_ticket_count) + toNumber(rawRow.paid_ticket_count)
    existing.total_revenue = toNumber(existing.total_revenue) + toNumber(rawRow.total_revenue)
    existing.vote_revenue = toNumber(existing.vote_revenue) + toNumber(rawRow.vote_revenue)
    existing.ticket_revenue = toNumber(existing.ticket_revenue) + toNumber(rawRow.ticket_revenue)
    existing.platform_fee_deducted = toNumber(existing.platform_fee_deducted) + toNumber(rawRow.platform_fee_deducted)
    existing.vote_platform_fee_deducted = toNumber(existing.vote_platform_fee_deducted) + toNumber(rawRow.vote_platform_fee_deducted)
    existing.ticket_platform_fee_deducted = toNumber(existing.ticket_platform_fee_deducted) + toNumber(rawRow.ticket_platform_fee_deducted)
    existing.net_earnings = toNumber(existing.net_earnings) + toNumber(rawRow.net_earnings)

    const existingPercent = toNumber(existing.platform_fee_percent)
    const nextPercent = toNumber(rawRow.platform_fee_percent)
    existing.platform_fee_percent = nextPercent || existingPercent

    const existingUpdatedAt = existing.updated_at || ''
    const nextUpdatedAt = rawRow.updated_at || ''
    if (nextUpdatedAt > existingUpdatedAt) {
      existing.updated_at = nextUpdatedAt
    }
  }

  const eventIds = Array.from(aggregated.keys())
  const { data: events } = eventIds.length
    ? await adminSupabase
        .from('events')
        .select('id,title')
        .in('id', eventIds)
    : { data: [] }

  const eventTitleMap = new Map<string, string>()
  for (const row of (events || []) as Array<{ id: string; title: string | null }>) {
    eventTitleMap.set(String(row.id), row.title || 'Untitled event')
  }

  return Array.from(aggregated.values())
    .map((row) => ({
      event_id: row.event_id,
      event_title: eventTitleMap.get(row.event_id) || row.event_id,
      total_votes: toNumber(row.total_votes),
      paid_votes: toNumber(row.paid_votes),
      free_votes: toNumber(row.free_votes),
      manual_votes: toNumber(row.manual_votes),
      paid_ticket_count: toNumber(row.paid_ticket_count),
      total_revenue: toNumber(row.total_revenue),
      vote_revenue: toNumber(row.vote_revenue),
      ticket_revenue: toNumber(row.ticket_revenue),
      platform_fee_percent: toNumber(row.platform_fee_percent),
      platform_fee_deducted: toNumber(row.platform_fee_deducted),
      vote_platform_fee_deducted: toNumber(row.vote_platform_fee_deducted),
      ticket_platform_fee_deducted: toNumber(row.ticket_platform_fee_deducted),
      net_earnings: toNumber(row.net_earnings),
      updated_at: row.updated_at || new Date().toISOString(),
    }))
    .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
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
