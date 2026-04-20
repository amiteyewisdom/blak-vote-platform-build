import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, ensureEventOwnedByOrganizer } from '@/lib/api-auth'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

const auditQuerySchema = z.object({
  eventId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export async function GET(request: NextRequest) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin', 'organizer'])

  if (!auth.ok) {
    return auth.response
  }

  const parseResult = auditQuerySchema.safeParse({
    eventId: request.nextUrl.searchParams.get('eventId'),
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  })

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid query', details: parseResult.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { eventId, limit = 200 } = parseResult.data
  const supabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(supabase, eventId, auth.userId)
    if (ownershipError) {
      return ownershipError
    }
  }

  let logs: any[] | null = null
  let error: any = null

  const fullSelect =
    'id, vote_id, event_id, candidate_id, voter_id, voter_phone, vote_type, is_manual, quantity, vote_source, payment_method, transaction_id, added_by_user_id, manual_entry_mode, manual_reason, occurred_at, logged_at'
  const fallbackSelect =
    'id, vote_id, event_id, candidate_id, voter_id, voter_phone, vote_type, is_manual, quantity, vote_source, payment_method, transaction_id, added_by_user_id, manual_entry_mode, occurred_at, logged_at'

  const primaryQuery = await supabase
    .from('vote_audit_log')
    .select(fullSelect)
    .eq('event_id', eventId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  logs = primaryQuery.data
  error = primaryQuery.error

  if (error && /manual_reason/i.test(error.message || '')) {
    const fallbackQuery = await supabase
      .from('vote_audit_log')
      .select(fallbackSelect)
      .eq('event_id', eventId)
      .order('occurred_at', { ascending: false })
      .limit(limit)

    logs = (fallbackQuery.data ?? []).map((log: any) => ({ ...log, manual_reason: null }))
    error = fallbackQuery.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const actorIds = [...new Set((logs ?? []).map((log) => log.added_by_user_id).filter(Boolean))]
  let actorMap = new Map<string, { name: string | null; email: string | null }>()

  if (actorIds.length > 0) {
    let actors: any[] | null = null
    let actorsError: any = null

    const actorPrimary = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .in('id', actorIds)

    actors = actorPrimary.data
    actorsError = actorPrimary.error

    if (actorsError && /(first_name|last_name)/i.test(actorsError.message || '')) {
      const actorFallback = await supabase
        .from('users')
        .select('id, email')
        .in('id', actorIds)

      actors = actorFallback.data
      actorsError = actorFallback.error
    }

    if (actorsError) {
      return NextResponse.json({ error: actorsError.message }, { status: 500 })
    }

    actorMap = new Map(
      (actors ?? []).map((actor) => [
        actor.id,
        {
          name: [actor.first_name, actor.last_name].filter(Boolean).join(' ') || null,
          email: actor.email ?? null,
        },
      ])
    )
  }

  const enrichedLogs = (logs ?? []).map((log) => ({
    ...log,
    added_by_name: log.added_by_user_id ? actorMap.get(log.added_by_user_id)?.name ?? null : null,
    added_by_email: log.added_by_user_id ? actorMap.get(log.added_by_user_id)?.email ?? null : null,
  }))

  return NextResponse.json({ logs: enrichedLogs })
}