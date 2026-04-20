import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

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

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const adminSupabase = getSupabaseAdminClient()

    const { data, error } = await adminSupabase.rpc('request_organizer_withdrawal', {
      p_organizer_id: auth.userId,
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
    console.error('Organizer withdrawal request error:', error)
    return NextResponse.json({ error: 'Failed to create withdrawal request' }, { status: 500 })
  }
}
