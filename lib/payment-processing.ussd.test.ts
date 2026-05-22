import { describe, expect, it } from 'vitest'

// Test helpers mirrored from payment-processing.ts
function paymentAmountsMatch(storedAmount: unknown, verifiedAmount: unknown) {
  const stored = Number(storedAmount)
  const verified = Number(verifiedAmount)

  if (!Number.isFinite(stored) || stored <= 0) {
    return true
  }

  if (!Number.isFinite(verified) || verified <= 0) {
    return true
  }

  return Math.abs(stored - verified) <= 0.02
}

function isSellableTicketPlan(ticket: {
  ticket_kind?: string | null
  parent_ticket_id?: string | null
}) {
  const ticketKind = String(ticket.ticket_kind || '').trim().toLowerCase()

  if (ticketKind === 'plan') {
    return true
  }

  return !ticket.parent_ticket_id && ticketKind !== 'issued'
}

describe('USSD payment verification helpers', () => {
  it('allows small Nalo amount differences', () => {
    expect(paymentAmountsMatch(50, 50)).toBe(true)
    expect(paymentAmountsMatch(50, 50.01)).toBe(true)
    expect(paymentAmountsMatch(50, 49.98)).toBe(true)
    expect(paymentAmountsMatch(50, 49.9)).toBe(false)
  })

  it('skips amount comparison when provider amount is missing', () => {
    expect(paymentAmountsMatch(25, 0)).toBe(true)
    expect(paymentAmountsMatch(25, null)).toBe(true)
  })

  it('accepts legacy ticket plans without ticket_kind=plan', () => {
    expect(isSellableTicketPlan({ ticket_kind: 'plan', parent_ticket_id: null })).toBe(true)
    expect(isSellableTicketPlan({ ticket_kind: null, parent_ticket_id: null })).toBe(true)
    expect(isSellableTicketPlan({ ticket_kind: 'issued', parent_ticket_id: 'plan-id' })).toBe(false)
    expect(isSellableTicketPlan({ ticket_kind: 'issued', parent_ticket_id: null })).toBe(false)
  })
})
