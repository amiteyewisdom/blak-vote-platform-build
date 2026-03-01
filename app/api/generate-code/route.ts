import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const codeSchema = z.object({
  type: z.enum(['event', 'nominee']),
  id: z.string().min(1),
});

function generateUniqueCode(prefix: string) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = codeSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { type, id } = parseResult.data;
    const code = generateUniqueCode(type === 'event' ? 'EV' : 'NM');
    let table = type === 'event' ? 'events' : 'nominees';
    const { error } = await supabase.from(table).update({ unique_code: code }).eq('id', id);
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} code generated`, code });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
