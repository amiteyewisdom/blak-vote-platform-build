import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

const adminSupabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) return auth.response

  const { organizerId } = await req.json()

  if (!organizerId) {
    return NextResponse.json({ error: 'Missing organizerId' }, { status: 400 })
  }

  const { error: userUpdateError } = await adminSupabase
    .from('users')
    .update({ status: 'deleted' })
    .eq('id', organizerId)
    .eq('role', 'organizer')

  if (userUpdateError) {
    return NextResponse.json({ error: userUpdateError.message }, { status: 500 })
  }

  await adminSupabase
    .from('events')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('organizer_id', organizerId)

  await adminSupabase
    .from('organizers')
    .update({ status: 'rejected' })
    .eq('user_id', organizerId)

  return NextResponse.json({ success: true })
}
