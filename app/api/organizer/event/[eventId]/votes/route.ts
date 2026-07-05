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

  let { data: eventData, error: eventError } = await adminSupabase
    .from('events')
    .select('id, organizer_id')
    .eq('id', eventId)
    .single()

  if (!eventData && !eventError) {
    const { data: byCode } = await adminSupabase
      .from('events')
      .select('id, organizer_id')
      .or(`short_code.eq.${eventId},event_code.eq.${eventId}`)
      .single()
    eventData = byCode || null
  }

  if (!eventData) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const resolvedEventId = String(eventData.id || '')

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, resolvedEventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  const { data: votes, error: votesError } = await adminSupabase
    .from('votes')
    .select(`
      *,
      nominations (nominee_name)
    `)
    .eq('event_id', resolvedEventId)
    .order('created_at', { ascending: false })

  if (votesError) {
    return NextResponse.json({ error: votesError.message }, { status: 500 })
  }

  return NextResponse.json({ votes: votes || [] })
}
