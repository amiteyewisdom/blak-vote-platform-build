import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/nominations/by-event
 * Fetch available nominees (nominations) for an event
 * Useful for manual voting dropdown selection
 * 
 * Query params:
 *   - event_id: UUID of the event
 */
export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get('event_id')
    const nomineeId = req.nextUrl.searchParams.get('nominee_id')
    if (!eventId) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    let query = supabase
      .from('nominations')
      .select('id, nominee_name, photo_url, category_id, event_id, status, created_at, categories(name)')
      .eq('event_id', eventId)
      .in('status', ['candidate', 'approved'])
      .order('nominee_name', { ascending: true })

    if (nomineeId) {
      query = query.eq('id', nomineeId)
    }

    const { data: nominees, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const normalized = (nominees ?? []).map((nominee: any) => ({
      nominee_id: nominee.id,
      nominee_name: nominee.nominee_name,
      photo_url: nominee.photo_url ?? null,
      category_id: nominee.category_id ?? null,
      category_name: nominee.categories?.name ?? null,
      event_id: nominee.event_id,
      status: nominee.status,
      created_at: nominee.created_at,
    }))

    if (nomineeId) {
      return NextResponse.json({ nominee: normalized[0] ?? null })
    }

    return NextResponse.json({ nominees: normalized })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
