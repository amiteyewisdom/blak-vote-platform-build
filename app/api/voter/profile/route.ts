import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth/server-auth'
import { getRedirectPathForRole } from '@/lib/auth/role-routing'

export async function GET() {
  try {
    const sessionUser = await getAuthenticatedUser()
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (sessionUser.role !== 'voter') {
      return NextResponse.json({ redirectTo: getRedirectPathForRole(sessionUser.role) }, { status: 403 })
    }

    const supabase = await createClient()
    const [{ data: profile }, { data: application }] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, first_name, last_name, full_name, role')
        .eq('id', sessionUser.id)
        .maybeSingle(),
      supabase
        .from('organizer_applications')
        .select('id, status, created_at, submitted_at, reviewed_at')
        .eq('user_id', sessionUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return NextResponse.json({ profile, application: application || null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load voter profile' }, { status: 500 })
  }
}