import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(request: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ['organizer'])
  if (!auth.ok) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('eventId')

  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: eventById } = await adminSupabase
    .from('events')
    .select('id, organizer_id')
    .eq('id', eventId)
    .maybeSingle()

  let eventData = eventById

  if (!eventData) {
    const { data: byCode } = await adminSupabase
      .from('events')
      .select('id, organizer_id')
      .or(`short_code.eq.${eventId},event_code.eq.${eventId}`)
      .maybeSingle()
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

  let votes: any[] | null = null
  let votesError: any = null

  const primaryQuery = await adminSupabase
    .from('votes')
    .select('*')
    .eq('event_id', resolvedEventId)
    .order('created_at', { ascending: false })

  votes = primaryQuery.data
  votesError = primaryQuery.error

  if (votesError) {
    return NextResponse.json({ error: votesError.message, eventId: resolvedEventId }, { status: 500 })
  }

  if (!votes || votes.length === 0) {
    const { data: auditLogs, error: auditError } = await adminSupabase
      .from('vote_audit_log')
      .select(
        'id, vote_id, event_id, candidate_id, voter_id, voter_phone, vote_type, quantity, vote_source, payment_method, transaction_id, added_by_user_id, manual_entry_mode, occurred_at, logged_at'
      )
      .eq('event_id', resolvedEventId)
      .eq('vote_type', 'paid')
      .order('occurred_at', { ascending: false })
      .limit(500)

    if (!auditError && auditLogs && auditLogs.length > 0) {
      const voteIds = [...new Set((auditLogs || []).map((row: any) => row.vote_id).filter(Boolean))]
      let voteAmountMap = new Map<string, { amount_paid: number | null; payment_status: string | null }>()

      if (voteIds.length > 0) {
        const { data: voteAmounts } = await adminSupabase
          .from('votes')
          .select('id, amount_paid, payment_status')
          .in('id', voteIds)

        for (const v of voteAmounts || []) {
          voteAmountMap.set(String(v.id), { amount_paid: v.amount_paid, payment_status: v.payment_status })
        }
      }

      votes = (auditLogs || []).map((row: any) => {
        const amountInfo = voteAmountMap.get(String(row.vote_id)) || { amount_paid: null, payment_status: null }
        return {
          id: row.vote_id || row.id,
          candidate_id: row.candidate_id,
          event_id: row.event_id,
          vote_type: row.vote_type,
          amount_paid: amountInfo.amount_paid,
          payment_status: amountInfo.payment_status || 'paid',
          quantity: row.quantity ?? 1,
          created_at: row.occurred_at,
          voter_id: row.voter_id,
          voter_phone: row.voter_phone,
        }
      })
    }
  }

  return NextResponse.json({ votes: votes || [], eventId: resolvedEventId, count: (votes || []).length })
}
