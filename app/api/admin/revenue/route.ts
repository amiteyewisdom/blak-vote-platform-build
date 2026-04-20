import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET() {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const adminSupabase = getSupabaseAdminClient()

    const { data: summaryRows, error: summaryError } = await adminSupabase
      .rpc('get_admin_revenue_summary')

    if (summaryError) {
      return NextResponse.json({ error: summaryError.message }, { status: 500 })
    }

    const { data: eventRows, error: eventError } = await adminSupabase
      .rpc('get_admin_revenue_by_event')

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    const summary = Array.isArray(summaryRows) && summaryRows.length > 0
      ? summaryRows[0]
      : {
          total_platform_revenue: 0,
          total_gross_revenue: 0,
          total_transactions: 0,
          last_transaction_at: null,
        }

    return NextResponse.json(
      {
        summary,
        perEventRevenue: eventRows || [],
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin revenue endpoint error:', error)
    return NextResponse.json({ error: 'Failed to fetch admin revenue' }, { status: 500 })
  }
}
