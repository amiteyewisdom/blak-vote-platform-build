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

  const { eventId, title, description, cost_per_vote, vote_price, start_date, end_date, image_url, status } = await req.json()

  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  const updatePayload: Record<string, any> = {}
  if (title !== undefined) updatePayload.title = title
  if (description !== undefined) updatePayload.description = description
  if (cost_per_vote !== undefined) updatePayload.cost_per_vote = cost_per_vote
  if (vote_price !== undefined) updatePayload.vote_price = vote_price
  if (start_date !== undefined) updatePayload.start_date = start_date || null
  if (end_date !== undefined) updatePayload.end_date = end_date || null
  if (image_url !== undefined) updatePayload.image_url = image_url
  if (status !== undefined) updatePayload.status = status
  if (status !== undefined) updatePayload.is_active = status === 'active'
  updatePayload.updated_at = new Date().toISOString()

  const { data, error } = await adminSupabase
    .from('events')
    .update(updatePayload)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, data })
}
