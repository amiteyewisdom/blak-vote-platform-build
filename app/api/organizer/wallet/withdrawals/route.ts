import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

function readTrimmedString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
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

    const { data, error } = await adminSupabase.rpc('get_organizer_withdrawal_history', {
      p_organizer_id: auth.userId,
      p_limit: limit,
      p_offset: offset,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        limit,
        offset,
        withdrawals: data || [],
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

    const { data, error } = await adminSupabase.rpc('request_organizer_withdrawal', {
      p_organizer_id: auth.userId,
      p_amount: amount,
      p_method: method,
      p_account_details: normalizedAccountDetails,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        withdrawal: Array.isArray(data) && data.length > 0 ? data[0] : null,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Organizer withdrawal request error:', error)
    return NextResponse.json({ error: 'Failed to create withdrawal request' }, { status: 500 })
  }
}
