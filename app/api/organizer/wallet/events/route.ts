import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { z } from 'zod'

const eventEarningsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

/**
 * GET /api/organizer/wallet/events
 *
 * Retrieves per-event earnings breakdown for the authenticated organizer:
 * - Event ID
 * - Vote counts (total, paid, free)
 * - Revenue amounts
 * - Platform fee deducted
 * - Net earnings per event
 * - Last updated timestamp
 *
 * Query params:
 * - limit: max 100, default 50
 * - offset: pagination offset, default 0
 *
 * Requires: organizer role
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const parsedQuery = eventEarningsQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const queryParams = parsedQuery.data

    // Get event earnings
    const { data: earnings, error: earningsError } = await supabase
      .rpc('get_organizer_event_earnings', {
        p_organizer_id: auth.userId,
      })

    let results = earnings || []

    if (earningsError) {
      // Fallback for environments where the RPC is missing or not yet migrated.
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from('organizer_event_earnings')
        .select('event_id,total_votes,paid_votes,free_votes,manual_votes,paid_ticket_count,vote_revenue,ticket_revenue,total_revenue,platform_fee_percent,vote_platform_fee_deducted,ticket_platform_fee_deducted,platform_fee_deducted,net_earnings,updated_at')
        .eq('organizer_id', auth.userId)
        .order('updated_at', { ascending: false })

      if (fallbackError) {
        return NextResponse.json({ error: earningsError.message }, { status: 500 })
      }

      results = fallbackRows || []
    }

    // Apply pagination
    const paginated = results.slice(queryParams.offset, queryParams.offset + queryParams.limit)

    return NextResponse.json(
      {
        total: results.length,
        limit: queryParams.limit,
        offset: queryParams.offset,
        earnings: paginated,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Event earnings endpoint error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve event earnings' },
      { status: 500 }
    )
  }
}
