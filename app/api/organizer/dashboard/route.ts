import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getOrganizerEventEarningsData, resolveOrganizerRefs } from '@/lib/organizer-wallet'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()
    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const refs = await resolveOrganizerRefs(adminSupabase as any, auth.userId)

    const [eventEarnings, eventRowsResult] = await Promise.all([
      getOrganizerEventEarningsData(adminSupabase as any, auth.userId),
      adminSupabase
        .from('events')
        .select('id, title, description, status, event_type, start_date, end_date, image_url, is_active, created_at, vote_platform_fee_percent, ticketing_fee_percent')
        .in('organizer_id', refs.aliases)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false }),
    ])

    const { data: eventRows, error } = eventRowsResult

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const earningMap = new Map(
      eventEarnings.map((earning: Record<string, unknown>) => [String(earning.event_id || ''), earning])
    )

    const events = (eventRows || []).map((event: Record<string, unknown>) => {
      const eventId = String(event.id || '')
      const earning = earningMap.get(eventId)
      const eventType = String(event.event_type || 'voting')

      const feePercent = eventType === 'ticketing'
        ? Number(event.ticketing_fee_percent ?? earning?.platform_fee_percent ?? 0)
        : Number(event.vote_platform_fee_percent ?? earning?.platform_fee_percent ?? 0)

      return {
        id: eventId,
        title: String(event.title || ''),
        description: String(event.description || ''),
        status: String(event.status || ''),
        event_type: eventType,
        start_date: event.start_date || null,
        end_date: event.end_date || null,
        image_url: event.image_url || null,
        is_active: Boolean(event.is_active),
        total_revenue: Number(earning?.net_earnings || 0),
        revenue_left: Number(earning?.revenue_left || 0),
        cashed_out_amount: Number(earning?.cashed_out_amount || 0),
        platform_fee_percent: feePercent,
        vote_platform_fee_deducted: Number(earning?.vote_platform_fee_deducted || 0),
        ticket_platform_fee_deducted: Number(earning?.ticket_platform_fee_deducted || 0),
      }
    })

    return NextResponse.json({ events })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load organizer dashboard' }, { status: 500 })
  }
}