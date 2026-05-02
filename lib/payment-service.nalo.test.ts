import { describe, expect, it } from 'vitest'
import { PaymentService } from '@/lib/payment-service'

describe('PaymentService.normalizeNaloCallback', () => {
  const service = new PaymentService()

  it('extracts reference and amount from nested payload fields', () => {
    const verification = service.normalizeNaloCallback({
      data: {
        status: 'SUCCESS',
        amount: '12.50',
      },
      extra_data: JSON.stringify({ reference: 'USSD-REF-001' }),
    })

    expect(verification.reference).toBe('USSD-REF-001')
    expect(verification.amount).toBe(12.5)
    expect(verification.status).toBe('success')
    expect(verification.provider).toBe('nalo')
    expect(verification.paymentMethod).toBe('momo')
  })

  it('accepts pending callbacks without amount', () => {
    const verification = service.normalizeNaloCallback({
      status: 'pending',
      reference: 'USSD-REF-002',
    })

    expect(verification.reference).toBe('USSD-REF-002')
    expect(verification.amount).toBe(0)
    expect(verification.status).toBe('pending')
  })

  it('rejects successful callbacks when amount is missing', () => {
    expect(() =>
      service.normalizeNaloCallback({
        status: 'success',
        reference: 'USSD-REF-003',
      })
    ).toThrow('Nalo callback missing amount')
  })
})
