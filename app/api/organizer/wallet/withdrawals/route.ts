import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'
import {
  createOrganizerWithdrawalRequest,
  getOrganizerWithdrawalHistoryData,
} from '@/lib/organizer-wallet'

function readTrimmedString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeWithdrawal(item: Record<string, unknown>) {
  const {
    platform_fee_amount: _platformFeeAmount,
    ...rest
  } = item

  return rest
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 100)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

    const adminSupabase = getSupabaseAdminClient()

    const data = await getOrganizerWithdrawalHistoryData(adminSupabase, auth.userId, limit, offset)

    return NextResponse.json(
      {
        limit,
        offset,
        withdrawals: (data || []).map((item) => sanitizeWithdrawal(item as Record<string, unknown>)),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Organizer withdrawal history error:', error)
    return NextResponse.json({ error: 'Failed to load withdrawal history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const amount = Number(body.amount)
    const method = typeof body.method === 'string' ? body.method : 'bank_transfer'
    const accountDetails = body.accountDetails && typeof body.accountDetails === 'object'
      ? body.accountDetails
      : {}
    const detailsRecord = accountDetails as Record<string, unknown>
    const accountName = readTrimmedString(detailsRecord, 'name') || readTrimmedString(detailsRecord, 'account_name')
    const accountNumber = readTrimmedString(detailsRecord, 'account_number')
    const bankCode = readTrimmedString(detailsRecord, 'bank_code')

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    if (method !== 'bank_transfer' && method !== 'mobile_money') {
      return NextResponse.json({ error: 'Unsupported withdrawal method' }, { status: 400 })
    }

    if (!accountName) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 })
    }

    if (!accountNumber) {
      return NextResponse.json({ error: method === 'mobile_money' ? 'Mobile money number is required' : 'Bank account number is required' }, { status: 400 })
    }

    if (!bankCode) {
      return NextResponse.json({ error: method === 'mobile_money' ? 'Mobile money provider is required' : 'Bank selection is required' }, { status: 400 })
    }

    const normalizedAccountDetails = {
      ...detailsRecord,
      name: accountName,
      account_name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'GHS',
    }

    const adminSupabase = getSupabaseAdminClient()

    const [{ data: feeOverride }, { data: globalSettings }, { data: feeResult }] = await Promise.all([
      adminSupabase
        .from('organizer_fee_overrides')
        .select('platform_fee_percent')
        .eq('organizer_user_id', auth.userId)
        .maybeSingle(),
      adminSupabase
        .from('platform_settings')
        .select('platform_fee_percent')
        .limit(1)
        .maybeSingle(),
      adminSupabase.rpc('get_effective_platform_fee_percent', {
        p_organizer_ref: auth.userId,
      }),
    ])

    const effectivePlatformFeePercent = Number(
      feeResult ?? feeOverride?.platform_fee_percent ?? globalSettings?.platform_fee_percent ?? 10
    )

    let withdrawal = null

    try {
      withdrawal = await createOrganizerWithdrawalRequest(adminSupabase, auth.userId, {
        amount,
        method,
        accountDetails: normalizedAccountDetails,
        platformFeePercent: effectivePlatformFeePercent,
      })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create withdrawal request' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        withdrawal: withdrawal ? sanitizeWithdrawal(withdrawal as Record<string, unknown>) : null,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Organizer withdrawal request error:', error)
    return NextResponse.json({ error: 'Failed to create withdrawal request' }, { status: 500 })
  }
}
