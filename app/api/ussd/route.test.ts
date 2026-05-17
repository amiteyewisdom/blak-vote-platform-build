import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsVotingOpenStatus = vi.fn((status: string | null | undefined) => Boolean(status) || true)
const mockGetSupabaseAdminClient = vi.fn()
const mockGetAllowedIps = vi.fn<(envName: string, fallbackIps?: string[]) => string[]>(
  (_envName, fallbackIps) => fallbackIps ?? ['136.243.56.160']
)
const mockIsRequestFromAllowedIps = vi.fn<(request: Request, allowedIps: string[]) => boolean>(() => true)
const mockBuildUssdTransactionId = vi.fn(() => 'USSD-test-ref')
const mockCreateOrReuseUssdPendingTransaction = vi.fn()
const mockInitiateMoMoPayment = vi.fn()
const mockUpdateUssdPendingTransaction = vi.fn()

vi.mock('@/lib/event-pricing', () => ({
  resolveEventVotePrice: vi.fn(() => 0),
}))

vi.mock('@/lib/event-status', () => ({
  isVotingOpenStatus: (status: string | null | undefined) => mockIsVotingOpenStatus(status),
}))

vi.mock('@/lib/nalo-payment', () => ({
  buildUssdTransactionId: mockBuildUssdTransactionId,
  createOrReuseUssdPendingTransaction: mockCreateOrReuseUssdPendingTransaction,
  initiateMoMoPayment: mockInitiateMoMoPayment,
  updateUssdPendingTransaction: mockUpdateUssdPendingTransaction,
}))

vi.mock('@/lib/server-security', () => ({
  getSupabaseAdminClient: () => mockGetSupabaseAdminClient(),
  getAllowedIps: (envName: string, fallbackIps?: string[]) => mockGetAllowedIps(envName, fallbackIps),
  isRequestFromAllowedIps: (request: Request, allowedIps: string[]) => mockIsRequestFromAllowedIps(request, allowedIps),
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

  or() {
    return this
  }

  order() {
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
      if (this.filters.id === 'event-1') {
        return Promise.resolve({
          data: {
            id: 'event-1',
            title: 'Launch Event',
            status: 'active',
            short_code: '337',
            event_code: '337',
          },
          error: null,
        })
      }

      const code = this.ilikeFilters.event_code ?? this.ilikeFilters.short_code
      if (code === '337') {
        return Promise.resolve({
          data: {
            id: 'event-1',
            title: 'Launch Event',
            status: 'active',
            short_code: '337',
            event_code: '337',
          },
          error: null,
        })
      }

      return Promise.resolve({ data: null, error: null })
    }

    if (this.table === 'nominations') {
      const code = this.ilikeFilters.voting_code ?? this.ilikeFilters.short_code
      if ((!this.filters.event_id || this.filters.event_id === 'event-1') && code === 'ABC') {
        return Promise.resolve({
          data: {
            id: 'candidate-1',
            nominee_name: 'Candidate A',
            event_id: 'event-1',
            status: 'approved',
          },
          error: null,
        })
      }

      return Promise.resolve({ data: null, error: null })
    }

    if (this.table === 'tickets') {
      if (this.filters.event_id === 'event-1') {
        return Promise.resolve({
          data: [
            {
              id: 'ticket-plan-1',
              event_id: 'event-1',
              name: 'Regular',
              price: 15,
              quantity: 100,
              sold_count: 10,
              admin_fee: null,
              created_at: '2026-05-15T00:00:00.000Z',
            },
          ],
          error: null,
        })
      }

      return Promise.resolve({ data: [], error: null })
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
    mockGetAllowedIps.mockImplementation((envName: string, fallbackIps?: string[]) => {
      if (envName === 'NALO_USSD_ALLOWED_IPS') {
        return ['136.243.56.160']
      }

      return Array.isArray(fallbackIps) ? fallbackIps : ['136.243.56.160']
    })
    mockIsRequestFromAllowedIps.mockReturnValue(true)
    mockBuildUssdTransactionId.mockClear()
    mockCreateOrReuseUssdPendingTransaction.mockReset()
    mockInitiateMoMoPayment.mockReset()
    mockUpdateUssdPendingTransaction.mockReset()
    delete process.env.USSD_WEBHOOK_SECRET
    delete process.env.NALO_USSD_SHORTCODE
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

  it('returns a Nalo JSON welcome response for initial shortcode dial', async () => {
    process.env.NALO_USSD_SHORTCODE = '*920*377#'
    const { POST } = await import('@/app/api/ussd/route')

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '136.243.56.160',
        },
        body: JSON.stringify({
          USERID: 'BLAKVOTE',
          MSISDN: '233501234567',
          SESSIONID: 'session-1',
          NETWORK: 'MTN',
          USERDATA: '*920*377#',
          MSGTYPE: 'Initial',
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.USERDATA).toBe('Welcome to BlakVote\n1. Vote\n2. Ticketing')
    expect(body.MSGTYPE).toBe(true)
  })

  it('initiates MoMo for vote confirmation using organizer-set price and nominee', async () => {
    const eventPricing = await import('@/lib/event-pricing')
    vi.mocked(eventPricing.resolveEventVotePrice).mockReturnValue(12.5)
    mockCreateOrReuseUssdPendingTransaction.mockResolvedValue({
      id: 'USSD-test-ref',
      phoneNumber: '233501234567',
      eventCode: '337',
      candidateCode: 'ABC',
      ticketPlan: null,
      quantity: 2,
      type: 'vote',
      amount: 25,
      status: 'pending',
      gatewayStatus: 'initialized',
    })
    mockInitiateMoMoPayment.mockResolvedValue({ success: true })

    const { POST } = await import('@/app/api/ussd/route')

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '136.243.56.160',
        },
        body: JSON.stringify({
          USERID: 'BLAKVOTE',
          MSISDN: '233501234567',
          SESSIONID: 'session-vote-1',
          NETWORK: 'MTN',
          USERDATA: '1*ABC*2*1',
          MSGTYPE: 'Continue',
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.USERDATA).toBe('Payment request sent. Please confirm on your phone.')
    expect(mockCreateOrReuseUssdPendingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vote',
        eventCode: '337',
        candidateCode: 'ABC',
        quantity: 2,
        amount: 25,
      })
    )
    expect(mockInitiateMoMoPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25,
        reference: 'USSD-test-ref',
      })
    )
  })

  it('initiates MoMo for ticket confirmation using ticket plan price', async () => {
    mockCreateOrReuseUssdPendingTransaction.mockResolvedValue({
      id: 'USSD-ticket-ref',
      phoneNumber: '233501234567',
      eventCode: '337',
      candidateCode: null,
      ticketPlan: { id: 'ticket-plan-1', name: 'Regular', optionNumber: 1 },
      quantity: 2,
      type: 'ticket',
      amount: 30,
      status: 'pending',
      gatewayStatus: 'initialized',
    })
    mockInitiateMoMoPayment.mockResolvedValue({ success: true })

    const { POST } = await import('@/app/api/ussd/route')

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '136.243.56.160',
        },
        body: JSON.stringify({
          USERID: 'BLAKVOTE',
          MSISDN: '233501234567',
          SESSIONID: 'session-ticket-1',
          NETWORK: 'MTN',
          USERDATA: '2*337*1*2*Kwame Mensah*1',
          MSGTYPE: 'Continue',
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.USERDATA).toBe('Payment request sent. Please confirm on your phone.')
    expect(mockCreateOrReuseUssdPendingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ticket',
        eventCode: '337',
        planId: 'ticket-plan-1',
        quantity: 2,
        amount: 30,
        buyerName: 'Kwame Mensah',
      })
    )
    expect(mockInitiateMoMoPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30,
        reference: 'USSD-ticket-ref',
      })
    )
  })

  it('accepts sha256-prefixed USSD signatures', async () => {
    process.env.USSD_WEBHOOK_SECRET = 'ussd-secret'
    const { POST } = await import('@/app/api/ussd/route')

    const rawBody = new URLSearchParams({
      sessionId: 'session-2',
      phoneNumber: '233501234567',
      text: '1*ABC',
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
    expect(body).toContain('CON Candidate: Candidate A')
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

  it('rejects requests from unauthorized source IPs', async () => {
    mockIsRequestFromAllowedIps.mockReturnValue(false)
    const { POST } = await import('@/app/api/ussd/route')

    const response = await POST(
      new Request('http://localhost:3000/api/ussd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '10.0.0.1',
        },
        body: new URLSearchParams({
          sessionId: 'session-4',
          phoneNumber: '233501234567',
          text: '',
        }).toString(),
      })
    )

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toBe('END Unauthorized source IP')
  })
})
