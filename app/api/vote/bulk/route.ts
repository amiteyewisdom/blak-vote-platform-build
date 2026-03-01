import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const bulkVoteSchema = z.object({
  votes: z.array(z.object({
    nominee_id: z.string().min(1),
    event_id: z.string().min(1),
    voter_id: z.string().min(1),
    count: z.number().int().positive(),
    method: z.enum(['manual', 'bulk']),
    organizer_id: z.string().optional(),
  })),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = bulkVoteSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { votes } = parseResult.data;
    const insertData = votes.map(v => ({
      nominee_id: v.nominee_id,
      event_id: v.event_id,
      voter_id: v.voter_id,
      count: v.count,
      method: v.method,
      organizer_id: v.organizer_id || null,
      created_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('vote_records').insert(insertData);
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Votes recorded successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
