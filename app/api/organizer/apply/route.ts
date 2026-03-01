import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const organizerApplicationSchema = z.object({
  company: z.string().min(2),
  website: z.string().url().optional(),
  bio: z.string().min(10),
  phone: z.string().min(7),
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = organizerApplicationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { company, website, bio, phone, email } = parseResult.data;

    // Insert application into organizer_applications table
    const { error } = await supabase.from('organizer_applications').insert({
      company,
      website,
      bio,
      phone,
      email,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Application submitted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
