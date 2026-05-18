import { NextResponse } from 'next/server'
import { LIVE_EVENT_STATUSES } from '@/lib/event-status'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const [usersResult, eventsResult, votesResult, activeEventsResult] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).in('status', [...LIVE_EVENT_STATUSES]),
    ])

    return NextResponse.json({
      totalUsers: usersResult.count || 0,
      totalEvents: eventsResult.count || 0,
      totalVotes: votesResult.count || 0,
      activeEvents: activeEventsResult.count || 0,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load dashboard' }, { status: 500 })
  }
}