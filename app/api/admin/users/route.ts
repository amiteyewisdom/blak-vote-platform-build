import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

const ALLOWED_ROLES = new Set(['admin', 'organizer', 'voter'])

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const adminSupabase = getSupabaseAdminClient()

    const [usersResult, currentAdminRow] = await Promise.all([
      adminSupabase
        .from('users')
        .select('id, email, role, status, first_name, last_name, full_name, created_at, is_super_admin')
        .order('created_at', { ascending: false }),
      adminSupabase
        .from('users')
        .select('is_super_admin')
        .eq('id', auth.userId)
        .maybeSingle(),
    ])

    const { data, error } = usersResult

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const isSuperAdmin = Boolean(currentAdminRow.data?.is_super_admin)

    return NextResponse.json({ users: data || [], isSuperAdmin })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load users' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => null)
    const userId = String(body?.userId || '').trim()
    const role = String(body?.role || '').trim()

    if (!userId || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Invalid role update payload' }, { status: 400 })
    }

    const { error } = await supabase
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update role' }, { status: 500 })
  }
}