import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { syncMissingAdminRevenueTransactions } from '@/lib/admin-revenue-sync'

function toNumber(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

async function resolvePlatformSummary(adminSupabase: any) {
  const { data: summaryRows, error: summaryError } = await adminSupabase.rpc('get_admin_revenue_summary')

  if (!summaryError) {
    const rpcSummary = Array.isArray(summaryRows) && summaryRows.length > 0 ? summaryRows[0] : null
    if (rpcSummary) {
      return rpcSummary
    }
  }

  const { data: fallbackRows, error: fallbackError } = await adminSupabase
    .from('admin_revenue_transactions')
    .select('platform_fee_amount,gross_amount,processed_at')

  if (fallbackError) {
    throw new Error(summaryError?.message || fallbackError.message)
  }

  const rows = Array.isArray(fallbackRows) ? fallbackRows : []
  const lastTransactionAt = rows.reduce<string | null>((latest, row) => {
    const processedAt = typeof row.processed_at === 'string' ? row.processed_at : null
    if (!processedAt) {
      return latest
    }

    return !latest || processedAt > latest ? processedAt : latest
  }, null)

  return {
    total_platform_revenue: rows.reduce((sum, row) => sum + toNumber(row.platform_fee_amount), 0),
    total_gross_revenue: rows.reduce((sum, row) => sum + toNumber(row.gross_amount), 0),
    total_transactions: rows.length,
    last_transaction_at: lastTransactionAt,
  }
}

async function resolveWithdrawalHistory(adminSupabase: any, limit: number, offset: number) {
  const { data: historyRows, error: historyError } = await adminSupabase.rpc('get_admin_platform_withdrawal_history', {
    p_limit: limit,
    p_offset: offset,
  })

  if (!historyError) {
    return Array.isArray(historyRows) ? historyRows : []
  }

  const { data: tableRows, error: tableError } = await adminSupabase
    .from('admin_platform_withdrawals')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tableError) {
    throw new Error(historyError.message || tableError.message)
  }

  return (Array.isArray(tableRows) ? tableRows : []).map((row) => ({
    ...row,
    withdrawal_id: row.withdrawal_id ?? row.id,
  }))
}

async function resolveAvailableBalance(adminSupabase: any, history: Array<Record<string, unknown>>, summary: Record<string, unknown>) {
  const { data: availableBalance, error: balanceError } = await adminSupabase.rpc('get_admin_available_platform_balance')

  if (!balanceError) {
    return toNumber(availableBalance)
  }

  const reservedStatuses = new Set(['pending', 'approved', 'processed'])
  const reservedAmount = history.reduce((sum, item) => {
    const status = String(item.status || '').toLowerCase()
    if (!reservedStatuses.has(status)) {
      return sum
    }

    return sum + toNumber(item.amount_requested)
  }, 0)

  return Math.max(toNumber(summary.total_platform_revenue) - reservedAmount, 0)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    try {
      await syncMissingAdminRevenueTransactions(adminSupabase)
    } catch (syncError) {
      console.warn('Admin platform withdrawals sync warning:', syncError)
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 100)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

    const [resolvedSummary, history] = await Promise.all([
      resolvePlatformSummary(adminSupabase),
      resolveWithdrawalHistory(adminSupabase, limit, offset),
    ])

    const summary = resolvedSummary || {
      total_platform_revenue: 0,
      total_gross_revenue: 0,
      total_transactions: 0,
      last_transaction_at: null,
    }

    const availableBalance = await resolveAvailableBalance(adminSupabase, history, summary)

    const pendingAmount = history
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + toNumber(item.amount_requested), 0)

    const processedAmount = history
      .filter((item) => item.status === 'processed')
      .reduce((sum, item) => sum + toNumber(item.amount_requested), 0)

    return NextResponse.json(
      {
        summary,
        availableBalance,
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

    try {
      await syncMissingAdminRevenueTransactions(adminSupabase)
    } catch (syncError) {
      console.warn('Admin platform withdrawals POST sync warning:', syncError)
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

    const { data: availableBalance, error: balanceError } = await adminSupabase.rpc('get_admin_available_platform_balance')
    console.log('[platform-withdrawal POST] amount:', amount, 'availableBalance:', availableBalance, 'balanceError:', balanceError?.message)

    if (!balanceError && amount > Number(availableBalance ?? 0)) {
      return NextResponse.json({
        error: `Insufficient available platform balance. Available: GHS ${Number(availableBalance ?? 0).toFixed(2)}, Requested: GHS ${amount.toFixed(2)}`,
      }, { status: 400 })
    }

    const { data, error } = await adminSupabase
      .from('admin_platform_withdrawals')
      .insert({
        requested_by_admin_id: auth.userId,
        requested_by_user_id: auth.userId,
        amount_requested: amount,
        method: method || 'bank_transfer',
        account_details: accountDetails,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select('id, amount_requested, status, requested_at')
      .single()

    if (error) {
      console.error('[platform-withdrawal POST] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        withdrawal: data,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin platform withdrawals POST error:', error)
    return NextResponse.json({ error: 'Failed to create platform withdrawal request' }, { status: 500 })
  }
}