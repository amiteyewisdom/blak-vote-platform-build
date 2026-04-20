import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: Request) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
    )

    const { data: event, error } = await supabase
      .from('events')
      .select('id, title, status, start_date, end_date, event_code, short_code, is_active')
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found', details: error?.message }, { status: 404 })
    }

    const now = new Date()
    const start = event.start_date ? new Date(event.start_date) : null
    const end = event.end_date ? new Date(event.end_date) : null

    return NextResponse.json({
      event,
      checks: {
        is_publicly_visible: event.status === 'active' || event.status === 'pending',
        is_voting_open: event.status === 'active',
        has_event_code: !!event.event_code,
        has_short_code: !!event.short_code,
        start_date_is_past: start ? now >= start : 'no start_date',
        end_date_is_future: end ? now <= end : 'no end_date',
        now: now.toISOString(),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
