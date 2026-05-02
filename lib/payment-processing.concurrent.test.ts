import { beforeEach, describe, expect, it, vi } from 'vitest'

type PaymentRow = {
  id: string
  reference: string
  event_id: string
  candidate_id: string
  quantity: number
  amount: number
  user_id: string | null
  voter_phone: string | null
  voter_email: string | null
  vote_id: string | null
  status: string
  gateway_status: string | null
  verified_at: string | null
  processed_at: string | null
}

type VoteRow = {
  id: string
  transaction_id: string
}

const state: {
  payment: PaymentRow
  votes: VoteRow[]
} = {
  payment: {
    id: 'pay-1',
    reference: 'PAY-REF-1',
    event_id: '11111111-1111-1111-1111-111111111111',
    candidate_id: '22222222-2222-2222-2222-222222222222',
    quantity: 1,
    amount: 10,
    user_id: null,
    voter_phone: null,
    voter_email: 'guest@example.com',
    vote_id: null,
    status: 'pending',
    gateway_status: null,
    verified_at: null,
    processed_at: null,
  },
  votes: [],
}

class Builder {
  private table: string
  private filters: Record<string, unknown> = {}
  private inFilters: Record<string, unknown[]> = {}
  private notEqualFilters: Record<string, unknown> = {}
  private nullFilters: string[] = []
  private ltFilters: Record<string, string> = {}
  private updatePayload: Record<string, unknown> | null = null

  constructor(table: string) {
    this.table = table
  }

  select() {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value
    return this
  }

  in(column: string, values: unknown[]) {
    this.inFilters[column] = values
    return this
  }

  neq(column: string, value: unknown) {
    this.notEqualFilters[column] = value
    return this
  }

  is(column: string, value: unknown) {
    if (value === null) {
      this.nullFilters.push(column)
    }
    return this
  }

  lt(column: string, value: string) {
    this.ltFilters[column] = value
    return this
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  gte() {
    return this
  }

  async maybeSingle() {
    if (this.table === 'events') {
      if (this.filters.id === state.payment.event_id) {
        return {
          data: {
            id: state.payment.event_id,
            title: 'Event',
            status: 'active',
            start_date: new Date(Date.now() - 60_000).toISOString(),
            end_date: new Date(Date.now() + 60_000).toISOString(),
            vote_price: 10,
            cost_per_vote: null,
            voting_fee: null,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    if (this.table === 'payments' && this.updatePayload) {
      const matchesReference = this.filters.reference === state.payment.reference
      const matchesStatus =
        (this.filters.status == null || this.filters.status === state.payment.status) &&
        (this.inFilters.status == null || this.inFilters.status.includes(state.payment.status))
      const matchesNotEqualFilters = Object.entries(this.notEqualFilters).every(
        ([column, value]) => (state.payment as Record<string, unknown>)[column] !== value
      )
      const requiresNullVote =
        this.nullFilters.length === 0 ||
        this.nullFilters.every((column) => (state.payment as Record<string, unknown>)[column] === null)

      if (matchesReference && matchesStatus && matchesNotEqualFilters && requiresNullVote) {
        Object.assign(state.payment, this.updatePayload)
        await new Promise((resolve) => setTimeout(resolve, 15))
        return { data: { id: state.payment.id }, error: null }
      }

      return { data: null, error: null }
    }

    if (this.table === 'payments') {
      if (this.filters.reference === state.payment.reference) {
        return { data: { ...state.payment }, error: null }
      }
      return { data: null, error: null }
    }

    if (this.table === 'votes') {
      const tx = this.filters.transaction_id
      const match = state.votes.find((v) => v.transaction_id === tx)
      return { data: match ? { id: match.id } : null, error: null }
    }

    return { data: null, error: null }
  }

  async single() {
    if (this.table === 'events') {
      return {
        data: {
          id: state.payment.event_id,
          title: 'Event',
          status: 'active',
          start_date: new Date(Date.now() - 60_000).toISOString(),
          end_date: new Date(Date.now() + 60_000).toISOString(),
          vote_price: 10,
          cost_per_vote: null,
          voting_fee: null,
        },
        error: null,
      }
    }

    if (this.table === 'nominations') {
      return {
        data: {
          id: state.payment.candidate_id,
          nominee_name: 'Candidate',
        },
        error: null,
      }
    }

    return { data: null, error: null }
  }

  async then(resolve: (value: { data: unknown; error: null }) => unknown) {
    if (this.table === 'payments' && this.updatePayload) {
      const matchesReference = this.filters.reference === state.payment.reference
      if (matchesReference) {
        Object.assign(state.payment, this.updatePayload)
      }
      return resolve({ data: null, error: null })
    }

    return resolve({ data: null, error: null })
  }
}

const mockSupabase = {
  from(table: string) {
    return new Builder(table)
  },
  async rpc(name: string, args?: Record<string, unknown>) {
    if (name === 'process_vote') {
      const existing = state.votes.find((v) => v.transaction_id === args?.p_transaction_id)
      if (!existing && typeof args?.p_transaction_id === 'string') {
        state.votes.push({ id: 'vote-1', transaction_id: args.p_transaction_id })
      }
      return { error: null }
    }

    return { data: null, error: null }
  },
}

vi.mock('@/lib/server-security', () => ({
  getSupabaseAdminClient: () => mockSupabase,
}))

vi.mock('@/lib/event-pricing', () => ({
  resolveEventVotePrice: () => 10,
}))

vi.mock('@/lib/event-status', () => ({
  isLiveEventStatus: () => true,
  isVotingOpenStatus: () => true,
}))

vi.mock('@/lib/audit-logging', () => ({
  logPaymentVerificationFailure: vi.fn(async () => undefined),
  logVoteCreationFailure: vi.fn(async () => undefined),
}))

import { processConfirmedPayment } from '@/lib/payment-processing'

describe('processConfirmedPayment concurrency', () => {
  beforeEach(() => {
    state.payment.vote_id = null
    state.payment.status = 'pending'
    state.payment.gateway_status = null
    state.payment.verified_at = null
    state.payment.processed_at = null
    state.votes.length = 0
  })

  it('creates at most one vote when verification is called in parallel', async () => {
    const payload = {
      reference: state.payment.reference,
      amount: state.payment.amount,
      status: 'success',
      metadata: {
        eventId: state.payment.event_id,
        candidateId: state.payment.candidate_id,
        quantity: state.payment.quantity,
        email: state.payment.voter_email,
      },
    }

    const [resultA, resultB] = await Promise.all([
      processConfirmedPayment(payload),
      processConfirmedPayment(payload),
    ])

    expect(state.votes).toHaveLength(1)

    const statuses = [resultA.status, resultB.status]
    expect(statuses.some((code) => code === 200)).toBe(true)
    expect(statuses.some((code) => code === 202 || code === 200)).toBe(true)

    const processedCount = [resultA, resultB].filter((r) => r.body.success === true).length
    expect(processedCount).toBeGreaterThanOrEqual(1)
  })
})
