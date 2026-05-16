import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

    const adminSupabase = getSupabaseAdminClient()
    const { data, error } = await adminSupabase
      .from('organizer_withdrawals')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      {
        withdrawals: data || [],
        limit,
        offset,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Admin organizer withdrawals error:', error)
    return NextResponse.json({ error: 'Failed to load organizer withdrawals' }, { status: 500 })
  }
}