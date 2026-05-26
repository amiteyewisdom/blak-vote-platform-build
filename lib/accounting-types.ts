// =============================================================================
// Accounting Types — Enterprise Ledger
// =============================================================================

export type PaymentContext = 'vote' | 'ticket'
export type PaymentProvider = 'paystack' | 'nalo' | 'paypal'
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'processed'
export type WithdrawalType = 'vote' | 'ticket' | 'combined'

// ── Admin revenue ledger ─────────────────────────────────────────────────────
export type AdminRevenueTransactionRow = {
  id: string
  payment_id: string
  payment_reference: string | null
  event_id: string
  event_title: string | null
  organizer_id: string | null
  vote_id: string | null
  vote_type: string | null
  payment_context: PaymentContext
  payment_provider: PaymentProvider
  gross_amount: number
  platform_fee_percent: number
  platform_fee_amount: number
  organizer_net_amount: number
  processed_at: string
}

// ── Organizer wallet (full schema after enterprise migration) ─────────────────
export type OrganizerWalletRow = {
  id: number
  organizer_id: string
  // Gross revenue by type
  total_revenue: number
  vote_revenue: number
  ticket_revenue: number
  // Volume counters
  total_paid_votes: number
  paid_ticket_count: number
  manual_votes: number
  // Platform fees deducted from gross
  platform_fees_deducted: number
  vote_platform_fees_deducted: number
  ticket_platform_fees_deducted: number
  // Organizer net (gross – fee)
  net_balance: number
  // Per-type net earnings (NEW)
  voting_earnings: number
  ticket_earnings: number
  total_earnings: number
  // Spendable / withdrawal tracking (NEW)
  withdrawable_balance: number    // reduces immediately on withdrawal request
  pending_balance: number         // sum of pending + approved withdrawals in-flight
  total_withdrawn: number         // sum of all non-cancelled/non-rejected withdrawals
  // Orphaned funds from deleted events
  transferable_balance: number
  last_updated: string
  created_at: string
}

// ── Admin platform wallet (singleton id = 1) ─────────────────────────────────
export type AdminPlatformWalletRow = {
  id: 1
  platform_voting_earnings: number
  platform_ticket_earnings: number
  total_platform_earnings: number
  last_updated: string
}

// ── Per-event earnings row ────────────────────────────────────────────────────
export type OrganizerEventEarningsRow = {
  id: number
  organizer_id: string
  event_id: string
  total_votes: number
  paid_votes: number
  free_votes: number
  manual_votes: number
  paid_ticket_count: number
  vote_revenue: number
  ticket_revenue: number
  total_revenue: number
  platform_fee_percent: number
  platform_fee_deducted: number
  vote_platform_fee_deducted: number
  ticket_platform_fee_deducted: number
  net_earnings: number
  vote_net_earnings: number
  ticket_net_earnings: number
  withdrawn_vote_revenue: number
  withdrawn_ticket_revenue: number
  created_at: string
  updated_at: string
}

// ── Organizer withdrawal row (full schema) ────────────────────────────────────
export type OrganizerWithdrawalRow = {
  id: number
  organizer_id: string
  event_id: string | null
  amount_requested: number
  platform_fee_percent: number
  platform_fee_amount: number
  net_amount: number
  method: string
  account_details: Record<string, unknown>
  withdrawal_type: WithdrawalType
  status: WithdrawalStatus
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

// ── RPC return types ──────────────────────────────────────────────────────────

export type PaymentSplitRpcResult = {
  already_recorded?: boolean
  recorded?: boolean
  payment_id: string
  gross_amount?: number
  platform_fee_percent?: number
  platform_fee_amount?: number
  organizer_amount?: number
  payment_context?: PaymentContext
}

export type WithdrawalRpcResult = {
  withdrawal_id: number
  amount: number
  new_withdrawable_balance: number
  status: 'pending'
}

export type WithdrawalReversalRpcResult = {
  reversed: boolean
  withdrawal_id: number
  amount: number
  organizer_id: string
}

export type WithdrawalProcessedRpcResult = {
  processed: boolean
  withdrawal_id: number
  amount: number
  payout_ref: string | null
}

export type WalletReconciliationRow = {
  organizer_id: string
  voting_earnings: number
  ticket_earnings: number
  withdrawable_balance: number
}

// ── Wallet summary (used by organizer dashboard / wallet page) ────────────────
export type WalletSummary = {
  // Gross
  total_revenue: number
  gross_revenue: number
  vote_revenue: number
  ticket_revenue: number
  // Counts
  total_paid_votes: number
  manual_votes: number
  paid_ticket_count: number
  // Fees
  platform_fees_deducted: number
  vote_platform_fees_deducted: number
  ticket_platform_fees_deducted: number
  // Organizer net
  net_balance: number
  voting_earnings: number
  ticket_earnings: number
  total_earnings: number
  // Spendable
  withdrawable_balance: number
  pending_balance: number
  available_balance: number
  // Historical
  total_withdrawn: number
  total_cashed_out: number
  transferable_balance: number
  pending_withdrawals: number
  last_updated: string
}

// ── Admin platform summary ────────────────────────────────────────────────────
export type AdminPlatformSummary = {
  platform_voting_earnings: number
  platform_ticket_earnings: number
  total_platform_earnings: number
  pending_admin_withdrawals: number
  available_platform_balance: number
}
