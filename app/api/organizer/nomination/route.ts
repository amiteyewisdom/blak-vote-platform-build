import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const nominationSchema = z.object({
  nomination_id: z.string().min(1),
  approve: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = nominationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { nomination_id, approve } = parseResult.data;
    const { error } = await supabase.from('nominations').update({ status: approve ? 'approved' : 'declined' }).eq('id', nomination_id);
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: `Nomination ${approve ? 'approved' : 'declined'} successfully` });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
