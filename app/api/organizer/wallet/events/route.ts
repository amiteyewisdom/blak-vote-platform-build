import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getOrganizerEventEarningsData } from '@/lib/organizer-wallet'
import { getSupabaseAdminClient } from '@/lib/server-security'
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
    const adminSupabase = getSupabaseAdminClient()

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

    const results = await getOrganizerEventEarningsData(adminSupabase, auth.userId)
    const sanitizedResults = results.map((item: Record<string, unknown>) => {
      const {
        platform_fee_deducted: _platformFeeDeducted,
        vote_platform_fee_deducted: _votePlatformFeeDeducted,
        ticket_platform_fee_deducted: _ticketPlatformFeeDeducted,
        ...rest
      } = item

      return rest
    })

    // Apply pagination
    const paginated = sanitizedResults.slice(queryParams.offset, queryParams.offset + queryParams.limit)

    return NextResponse.json(
      {
        total: sanitizedResults.length,
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
