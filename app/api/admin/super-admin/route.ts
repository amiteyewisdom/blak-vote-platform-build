import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) return auth.response

    const adminSupabase = getSupabaseAdminClient()

    const { data: callerRow } = await adminSupabase
      .from('users')
      .select('is_super_admin')
      .eq('id', auth.userId)
      .maybeSingle()

    if (!callerRow?.is_super_admin) {
      return NextResponse.json({ error: 'Super admin privileges required' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const isSuperAdmin = Boolean(body.isSuperAdmin)

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (userId === auth.userId) {
      return NextResponse.json({ error: 'Cannot modify your own super admin status' }, { status: 400 })
    }

    const { data: targetRow } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (!targetRow || targetRow.role !== 'admin') {
      return NextResponse.json({ error: 'Super admin can only be granted to admin users' }, { status: 400 })
    }

    const { error } = await adminSupabase
      .from('users')
      .update({ is_super_admin: isSuperAdmin, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, isSuperAdmin })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update super admin status' },
      { status: 500 }
    )
  }
}
