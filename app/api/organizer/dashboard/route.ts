import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const { data: organizerRecord } = await supabase
      .from('organizers')
      .select('id')
      .eq('user_id', auth.userId)
      .maybeSingle()

    const organizerIds = organizerRecord?.id ? [auth.userId, organizerRecord.id] : [auth.userId]

    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, status, total_revenue, start_date, end_date, image_url, is_active')
      .in('organizer_id', organizerIds)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ events: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load organizer dashboard' }, { status: 500 })
  }
}