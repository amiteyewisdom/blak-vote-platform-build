export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Fetch all active events
    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)

    if (eventError || !events) {
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // For each event, fetch nominees sorted by votes desc
    const eventNominees = await Promise.all(events.map(async (event) => {
      const { data: nominees, error: nomineeError } = await supabase
        .from('nominees')
        .select('*')
        .eq('event_id', event.id)
        .order('votes', { ascending: false });
      return {
        event,
        nominees: nominees ?? [],
      };
    }));

    return NextResponse.json({ eventNominees });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}