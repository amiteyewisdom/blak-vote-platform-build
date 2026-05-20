import { NextResponse } from 'next/server'
import { LIVE_EVENT_STATUSES } from '@/lib/event-status'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

function isLiveStatus(status: string | null | undefined) {
  if (!status) {
    return false
  }

  return LIVE_EVENT_STATUSES.includes(String(status).trim().toLowerCase() as (typeof LIVE_EVENT_STATUSES)[number])
}

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const [usersResult, eventsResult, votesResult, eventStatusesResult] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('status').neq('status', 'deleted'),
    ])

    const activeEvents = (eventStatusesResult.data || []).reduce((count, event) => {
      return count + (isLiveStatus((event as { status?: string | null }).status) ? 1 : 0)
    }, 0)

    return NextResponse.json({
      totalUsers: usersResult.count || 0,
      totalEvents: eventsResult.count || 0,
      totalVotes: votesResult.count || 0,
      activeEvents,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load dashboard' }, { status: 500 })
  }
}