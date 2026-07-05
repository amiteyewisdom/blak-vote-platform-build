import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['organizer'])
  if (!auth.ok) {
    return auth.response
  }

  const { eventId } = await params

  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  const { data, error } = await adminSupabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: earnings } = await adminSupabase
    .from('organizer_event_earnings')
    .select('net_earnings, total_revenue, platform_fee_deducted')
    .eq('event_id', eventId)
    .maybeSingle()

  const event = {
    ...data,
    total_revenue: earnings?.net_earnings ?? data.total_revenue ?? 0,
    gross_revenue: earnings?.total_revenue ?? data.total_revenue ?? 0,
    platform_fee_deducted: earnings?.platform_fee_deducted ?? 0,
  }

  return NextResponse.json({ event })
}