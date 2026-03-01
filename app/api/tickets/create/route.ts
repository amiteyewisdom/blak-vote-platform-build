import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ticketSchema = z.object({
  event_id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  admin_fee: z.number().nonnegative(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = ticketSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { event_id, name, price, quantity, admin_fee } = parseResult.data;

    // Insert ticket into tickets table
    const { error } = await supabase.from('tickets').insert({
      event_id,
      name,
      price,
      quantity,
      admin_fee,
      created_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Ticket created successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
