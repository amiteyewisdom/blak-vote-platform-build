import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsVotingOpenStatus = vi.fn((status: string | null | undefined) => Boolean(status) || true)
const mockGetSupabaseAdminClient = vi.fn()

vi.mock('@/lib/event-pricing', () => ({
  resolveEventVotePrice: vi.fn(() => 0),
}))

vi.mock('@/lib/event-status', () => ({
  isVotingOpenStatus: (status: string | null | undefined) => mockIsVotingOpenStatus(status),
}))

vi.mock('@/lib/nalo-payment', () => ({
  buildUssdTransactionId: vi.fn(() => 'USSD-test-ref'),
  createOrReuseUssdPendingTransaction: vi.fn(),
  initiateMoMoPayment: vi.fn(),
  updateUssdPendingTransaction: vi.fn(),
}))

vi.mock('@/lib/server-security', () => ({
  getSupabaseAdminClient: () => mockGetSupabaseAdminClient(),
}))

type QueryResult = {
  data: unknown
  error: { message: string } | null
}

class QueryBuilder {
  private table: string
  private filters: Record<string, unknown> = {}
  private ilikeFilters: Record<string, string> = {}

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

  ilike(column: string, value: string) {
    this.ilikeFilters[column] = value
    return this
  }

  maybeSingle(): Promise<QueryResult> {
    if (this.table === 'events') {
      const code = this.ilikeFilters.event_code ?? this.ilikeFilters.short_code
      if (code === '337') {
        return Promise.resolve({
          data: {
            id: 'event-1',
            title: 'Launch Event',
            status: 'active',
          },
          error: null,
        })
      }

      return Promise.resolve({ data: null, error: null })
    }

    if (this.table === 'nominations') {
      const code = this.ilikeFilters.voting_code ?? this.ilikeFilters.short_code
      if (this.filters.event_id === 'event-1' && code === 'ABC') {
        return Promise.resolve({
          data: {
            id: 'candidate-1',
            nominee_name: 'Candidate A',
            status: 'approved',
          },
          error: null,
        })
      }

      return Promise.resolve({ data: null, error: null })
    }

    return Promise.resolve({ data: null, error: null })
  }
}

function createMockSupabase() {
  return {
    from(table: string) {
      return new QueryBuilder(table)
    },
    rpc: vi.fn(),
  }
}

describe('USSD route', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetSupabaseAdminClient.mockReturnValue(createMockSupabase())
    mockIsVotingOpenStatus.mockReturnValue(true)
    delete process.env.USSD_WEBHOOK_SECRET
  })

  afterEach(() => {
    delete process.env.USSD_WEBHOOK_SECRET
  })

  it('returns the welcome menu when no text is provided', async () => {
    const { POST } = await import('@/app/api/ussd/route')

    const request = new Request('http://localhost:3000/api/ussd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        sessionId: 'session-1',
        phoneNumber: '233501234567',
        text: '',
      }).toString(),
    })

    const response = await POST(request)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toBe('CON Welcome to BlakVote\n1. Vote\n2. Ticketing')
  })

  it('accepts sha256-prefixed USSD signatures', async () => {
    process.env.USSD_WEBHOOK_SECRET = 'ussd-secret'
    const { POST } = await import('@/app/api/ussd/route')

    const rawBody = new URLSearchParams({
      sessionId: 'session-2',
      phoneNumber: '233501234567',
      text: '1*337',
    }).toString()

    const crypto = await import('crypto')
    const signature = `sha256=${crypto.createHmac('sha256', 'ussd-secret').update(rawBody).digest('hex')}`

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-signature': signature,
        },
        body: rawBody,
      })
    )

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('CON Event: Launch Event')
  })

  it('rejects invalid signatures when a USSD secret is configured', async () => {
    process.env.USSD_WEBHOOK_SECRET = 'ussd-secret'
    const { POST } = await import('@/app/api/ussd/route')

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-signature': 'sha256=deadbeef',
        },
        body: new URLSearchParams({
          sessionId: 'session-3',
          phoneNumber: '233501234567',
          text: '1',
        }).toString(),
      })
    )

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toBe('END Invalid USSD signature')
  })
})
