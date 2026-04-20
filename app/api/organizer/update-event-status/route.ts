import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function POST(req: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['organizer'])
  if (!auth.ok) {
    return auth.response
  }

  const { eventId, status } = await req.json()

  if (!eventId || !status) {
    return NextResponse.json({ error: 'Missing eventId or status' }, { status: 400 })
  }

  if (!['active', 'pending', 'closed', 'draft'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  const { data, error } = await adminSupabase
    .from('events')
    .update({
      status,
      is_active: status === 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, data })
}
