type SupabaseLike = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export type OrganizerWithdrawalPayoutRow = {
  id: number
  organizer_id: string
  amount_requested: number
  net_amount: number
  method: string | null
  account_details: Record<string, unknown> | null
  status: string
  admin_note?: string | null
  approved_at?: string | null
  processed_at?: string | null
  payout_provider?: string | null
  payout_reference?: string | null
  payout_recipient_code?: string | null
}

type PaystackBalanceRow = {
  currency?: string
  balance?: number
}

type PaystackResponse<T> = {
  status?: boolean
  message?: string
  data?: T
}

type PayoutAttemptResult = {
  status: 'processed' | 'pending_funds' | 'approved'
  message: string
}

function requirePaystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim()

  if (!secret) {
    throw new Error('Missing required environment variable: PAYSTACK_SECRET_KEY')
  }

  return secret
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<PaystackResponse<T>> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requirePaystackSecret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  const payload = (await response.json().catch(() => ({}))) as PaystackResponse<T>

  if (!response.ok) {
    throw new Error(payload?.message || `Paystack request failed with status ${response.status}`)
  }

  return payload
}

function formatCurrencyAmount(amount: number) {
  return `GHS ${amount.toFixed(2)}`
}

function toSubunit(amount: number) {
  return Math.round(amount * 100)
}

function getAccountDetails(accountDetails: Record<string, unknown> | null | undefined) {
  return accountDetails && typeof accountDetails === 'object' ? accountDetails : {}
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function isInsufficientBalanceMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('insufficient') && normalized.includes('balance')
}

async function updateOrganizerWithdrawal(
  supabase: SupabaseLike,
  withdrawalId: number,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from('organizer_withdrawals').update(payload).eq('id', withdrawalId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getPaystackAvailablePayoutBalance(currency: string = 'GHS') {
  const payload = await paystackRequest<PaystackBalanceRow[]>('/balance')
  const rows = Array.isArray(payload.data) ? payload.data : []
  const selected = rows.find((row) => String(row.currency || '').toUpperCase() === currency.toUpperCase())

  return Number(selected?.balance || 0) / 100
}

async function ensureTransferRecipient(withdrawal: OrganizerWithdrawalPayoutRow) {
  if (withdrawal.payout_recipient_code) {
    return withdrawal.payout_recipient_code
  }

  const accountDetails = getAccountDetails(withdrawal.account_details)
  const existingCode = readString(accountDetails, [
    'paystackRecipientCode',
    'paystack_recipient_code',
    'recipientCode',
    'recipient_code',
  ])

  if (existingCode) {
    return existingCode
  }

  const recipientType =
    readString(accountDetails, ['paystackRecipientType', 'paystack_recipient_type', 'recipientType', 'recipient_type']) ||
    (withdrawal.method === 'mobile_money' ? 'mobile_money' : 'ghipss')

  const accountNumber = readString(accountDetails, ['account_number', 'accountNumber', 'phone_number', 'phoneNumber'])
  const bankCode = readString(accountDetails, ['bank_code', 'bankCode', 'provider_code', 'providerCode'])
  const recipientName =
    readString(accountDetails, ['account_name', 'accountName', 'name']) ||
    `Organizer withdrawal ${withdrawal.id}`

  if (!accountNumber) {
    throw new Error('Missing recipient account number or phone number for Paystack payout.')
  }

  if (!bankCode) {
    throw new Error('Missing bank_code/provider_code for Paystack payout recipient. Use the Paystack bank or telco code from the GHS bank list endpoint.')
  }

  const payload = await paystackRequest<{ recipient_code?: string }>('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: recipientType,
      name: recipientName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: readString(accountDetails, ['currency']) || 'GHS',
      description:
        readString(accountDetails, ['description']) || `Organizer withdrawal recipient ${withdrawal.id}`,
      metadata: {
        organizer_withdrawal_id: withdrawal.id,
      },
    }),
  })

  const recipientCode = payload.data?.recipient_code?.trim()

  if (!recipientCode) {
    throw new Error('Paystack recipient creation did not return a recipient code.')
  }

  return recipientCode
}

export async function attemptPaystackOrganizerWithdrawalPayout(params: {
  supabase: SupabaseLike
  withdrawal: OrganizerWithdrawalPayoutRow
  trigger: 'approval' | 'cron'
}) : Promise<PayoutAttemptResult> {
  const { supabase, withdrawal, trigger } = params

  if (withdrawal.processed_at || withdrawal.status === 'processed') {
    return {
      status: 'processed',
      message: 'Withdrawal already processed.',
    }
  }

  const netAmount = Number(withdrawal.net_amount || 0)

  if (!Number.isFinite(netAmount) || netAmount <= 0) {
    throw new Error('Withdrawal net amount is invalid for payout.')
  }

  const recipientCode = await ensureTransferRecipient(withdrawal)
  const payoutReference = withdrawal.payout_reference || `organizer-withdrawal-${withdrawal.id}`
  const attemptedAt = new Date().toISOString()

  await updateOrganizerWithdrawal(supabase, withdrawal.id, {
    payout_provider: 'paystack',
    payout_reference: payoutReference,
    payout_recipient_code: recipientCode,
    payout_attempted_at: attemptedAt,
  })

  const availableBalance = await getPaystackAvailablePayoutBalance('GHS')

  if (availableBalance < netAmount) {
    const message = `Waiting for Paystack funds. Required ${formatCurrencyAmount(netAmount)}, available ${formatCurrencyAmount(availableBalance)}.`

    await updateOrganizerWithdrawal(supabase, withdrawal.id, {
      status: 'pending_funds',
      payout_failure_reason: message,
      payout_metadata: {
        trigger,
        last_available_balance: availableBalance,
      },
    })

    return {
      status: 'pending_funds',
      message,
    }
  }

  try {
    const transferPayload = await paystackRequest<{ transfer_code?: string; status?: string }>('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance',
        amount: toSubunit(netAmount),
        recipient: recipientCode,
        reason: `Organizer withdrawal #${withdrawal.id}`,
        reference: payoutReference,
      }),
    })

    await updateOrganizerWithdrawal(supabase, withdrawal.id, {
      status: 'processed',
      processed_at: new Date().toISOString(),
      payout_failure_reason: null,
      payout_metadata: {
        trigger,
        transfer_code: transferPayload.data?.transfer_code || null,
        transfer_status: transferPayload.data?.status || null,
      },
    })

    return {
      status: 'processed',
      message: 'Payout created in Paystack and marked processed.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paystack payout failed'

    if (isInsufficientBalanceMessage(message)) {
      await updateOrganizerWithdrawal(supabase, withdrawal.id, {
        status: 'pending_funds',
        payout_failure_reason: message,
        payout_metadata: {
          trigger,
        },
      })

      return {
        status: 'pending_funds',
        message,
      }
    }

    await updateOrganizerWithdrawal(supabase, withdrawal.id, {
      status: 'approved',
      payout_failure_reason: message,
      payout_metadata: {
        trigger,
      },
    })

    return {
      status: 'approved',
      message: `Approval saved, but Paystack payout failed: ${message}`,
    }
  }
}