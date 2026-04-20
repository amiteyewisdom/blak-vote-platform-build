import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 100)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

    const [{ data: summaryRows, error: summaryError }, { data: availableBalance, error: balanceError }, { data: historyRows, error: historyError }] = await Promise.all([
      adminSupabase.rpc('get_admin_revenue_summary'),
      adminSupabase.rpc('get_admin_available_platform_balance'),
      adminSupabase.rpc('get_admin_platform_withdrawal_history', {
        p_limit: limit,
        p_offset: offset,
      }),
    ])

    if (summaryError) {
      return NextResponse.json({ error: summaryError.message }, { status: 500 })
    }

    if (balanceError) {
      return NextResponse.json({ error: balanceError.message }, { status: 500 })
    }

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    const summary = Array.isArray(summaryRows) && summaryRows.length > 0
      ? summaryRows[0]
      : {
          total_platform_revenue: 0,
          total_gross_revenue: 0,
          total_transactions: 0,
          last_transaction_at: null,
        }

    const history = Array.isArray(historyRows) ? historyRows : []

    const pendingAmount = history
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + Number(item.amount_requested || 0), 0)

    const processedAmount = history
      .filter((item) => item.status === 'processed')
      .reduce((sum, item) => sum + Number(item.amount_requested || 0), 0)

    return NextResponse.json(
      {
        summary,
        availableBalance: Number(availableBalance || 0),
        pendingAmount,
        processedAmount,
        withdrawals: history,
        limit,
        offset,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin platform withdrawals GET error:', error)
    return NextResponse.json({ error: 'Failed to load platform withdrawals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const amount = Number(body.amount)
    const method = typeof body.method === 'string' ? body.method : 'bank_transfer'
    const accountDetails = body.accountDetails && typeof body.accountDetails === 'object'
      ? body.accountDetails
      : {}

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const { data, error } = await adminSupabase.rpc('request_admin_platform_withdrawal', {
      p_admin_user_id: auth.userId,
      p_amount: amount,
      p_method: method,
      p_account_details: accountDetails,
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
    console.error('Admin platform withdrawals POST error:', error)
    return NextResponse.json({ error: 'Failed to create platform withdrawal request' }, { status: 500 })
  }
}