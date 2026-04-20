import {
  initializeVotePayment,
  processConfirmedPayment,
  verifyPaystackReference,
  type PaymentMethod,
  type PaymentProvider,
  type PaymentVerificationPayload,
} from '@/lib/payment-processing'

type ProviderVerificationInput = {
  provider: PaymentProvider
  referenceId?: string | null
  amount?: number | null
  status?: string | null
  metadata?: unknown
  payload?: Record<string, unknown>
}

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim()
    }
  }

  return ''
}

function readNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function normalizeProviderStatus(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase()
}

function buildNormalizedVerification(params: {
  provider: PaymentProvider
  paymentMethod: PaymentMethod
  reference: string
  amount: number
  status: string
  metadata?: unknown
}): PaymentVerificationPayload {
  return {
    provider: params.provider,
    paymentMethod: params.paymentMethod,
    reference: params.reference,
    amount: params.amount,
    status: params.status,
    metadata: params.metadata ?? {},
  }
}

export class PaymentService {
  async initiatePayment(input: unknown) {
    return initializeVotePayment(input)
  }

  async verifyPayment(input: ProviderVerificationInput) {
    if (input.provider === 'paystack') {
      if (!input.referenceId) {
        throw new Error('Reference required')
      }

      return verifyPaystackReference(input.referenceId)
    }

    if (input.provider === 'nalo') {
      return this.normalizeNaloCallback(input.payload ?? {})
    }

    if (!input.referenceId) {
      throw new Error('Reference required')
    }

    if (!Number.isFinite(Number(input.amount))) {
      throw new Error('Amount required')
    }

    return buildNormalizedVerification({
      provider: input.provider,
      paymentMethod: input.provider === 'paypal' ? 'paypal' : 'paystack',
      reference: input.referenceId,
      amount: Number(input.amount),
      status: normalizeProviderStatus(input.status),
      metadata: input.metadata,
    })
  }

  async handleSuccess(payment: PaymentVerificationPayload) {
    return processConfirmedPayment(payment)
  }

  normalizeNaloCallback(payload: Record<string, unknown>) {
    const lowered = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value])
    )

    const extraDataValue = lowered['extra_data'] ?? lowered['extradata']
    const loweredExtraData =
      extraDataValue && typeof extraDataValue === 'object'
        ? Object.fromEntries(
            Object.entries(extraDataValue as Record<string, unknown>).map(([key, value]) => [
              key.toLowerCase(),
              value,
            ])
          )
        : {}

    const reference =
      readString(loweredExtraData, [
        'reference',
        'reference_id',
        'transactionid',
        'transaction_id',
        'clientreference',
        'client_reference',
        'externalreference',
      ]) ||
      readString(lowered, [
        'reference',
        'reference_id',
        'transactionid',
        'transaction_id',
        'clientreference',
        'client_reference',
        'externalreference',
        'order_id',
        'orderid',
      ])

    if (!reference) {
      throw new Error('Nalo callback missing payment reference')
    }

    const amount = readNumber(lowered, ['amount', 'amountpaid', 'paidamount'])
    if (!Number.isFinite(Number(amount))) {
      throw new Error('Nalo callback missing amount')
    }

    const status = normalizeProviderStatus(
      readString(lowered, ['status', 'paymentstatus', 'transactionstatus', 'state'])
    )

    return buildNormalizedVerification({
      provider: 'nalo',
      paymentMethod: 'momo',
      reference,
      amount: Number(amount),
      status,
      metadata: payload,
    })
  }
}

export const paymentService = new PaymentService()