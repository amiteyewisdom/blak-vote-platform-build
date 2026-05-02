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

const NALO_CONFIRMED_STATUSES = ['success', 'paid', 'completed', 'processed']

function toLowerCaseKeys(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value])
  ) as Record<string, unknown>
}

function parseStructuredValue(value: unknown) {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Continue to URL-encoded parsing fallback.
  }

  const params = new URLSearchParams(trimmed)
  const entries = Array.from(params.entries())
  if (entries.length === 0) {
    return null
  }

  return Object.fromEntries(entries)
}

function isConfirmedNaloStatus(status: string) {
  return NALO_CONFIRMED_STATUSES.includes(status)
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
    const lowered = toLowerCaseKeys(payload)

    const loweredData = toLowerCaseKeys(
      parseStructuredValue(lowered['data'] ?? lowered['payload'] ?? lowered['result']) ?? {}
    )

    const loweredExtraData = toLowerCaseKeys(
      parseStructuredValue(
        lowered['extra_data'] ??
          lowered['extradata'] ??
          loweredData['extra_data'] ??
          loweredData['extradata']
      ) ?? {}
    )

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
      readString(loweredData, [
        'reference',
        'reference_id',
        'transactionid',
        'transaction_id',
        'clientreference',
        'client_reference',
        'externalreference',
        'order_id',
        'orderid',
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

    const status = normalizeProviderStatus(
      readString(loweredData, ['status', 'paymentstatus', 'transactionstatus', 'state']) ||
        readString(lowered, ['status', 'paymentstatus', 'transactionstatus', 'state'])
    )

    if (!status) {
      throw new Error('Nalo callback missing status')
    }

    const amount =
      readNumber(loweredData, ['amount', 'amountpaid', 'paidamount']) ??
      readNumber(lowered, ['amount', 'amountpaid', 'paidamount'])

    if ((amount == null || !Number.isFinite(Number(amount))) && isConfirmedNaloStatus(status)) {
      throw new Error('Nalo callback missing amount')
    }

    return buildNormalizedVerification({
      provider: 'nalo',
      paymentMethod: 'momo',
      reference,
      amount: amount != null && Number.isFinite(Number(amount)) ? Number(amount) : 0,
      status,
      metadata: payload,
    })
  }
}

export const paymentService = new PaymentService()