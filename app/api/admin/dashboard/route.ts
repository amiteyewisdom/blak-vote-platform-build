import { NextResponse } from 'next/server'
import { LIVE_EVENT_STATUSES } from '@/lib/event-status'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

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

    const adminSupabase = getSupabaseAdminClient()

    const [usersResult, eventsResult, votesResult, eventStatusesResult, revenueResult] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('status').neq('status', 'deleted'),
      adminSupabase.rpc('get_admin_revenue_summary'),
    ])

    const activeEvents = (eventStatusesResult.data || []).reduce((count, event) => {
      return count + (isLiveStatus((event as { status?: string | null }).status) ? 1 : 0)
    }, 0)

    const revRow = Array.isArray(revenueResult.data) && revenueResult.data.length > 0
      ? revenueResult.data[0] as Record<string, unknown>
      : null

    return NextResponse.json({
      totalUsers: usersResult.count || 0,
      totalEvents: eventsResult.count || 0,
      totalVotes: votesResult.count || 0,
      activeEvents,
      totalPlatformRevenue: Number(revRow?.total_platform_revenue ?? 0),
      votePlatformRevenue: Number(revRow?.vote_platform_revenue ?? 0),
      ticketPlatformRevenue: Number(revRow?.ticket_platform_revenue ?? 0),
      totalGrossRevenue: Number(revRow?.total_gross_revenue ?? 0),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load dashboard' }, { status: 500 })
  }
}