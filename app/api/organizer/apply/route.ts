import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const organizerApplicationSchema = z.object({
  company: z.string().min(2),
  website: z.string().url().optional(),
  bio: z.string().min(10),
  phone: z.string().min(7),
  email: z.string().email(),
  id_type: z.enum(['national_id', 'passport', 'drivers_license', 'voter_id']),
  id_number: z.string().min(3, 'ID number must be at least 3 characters'),
});

export async function POST(req: Request) {
  try {
    const sessionClient = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', user.id)
      .maybeSingle();

    if (userError || !dbUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (dbUser.role !== 'voter') {
      return NextResponse.json({ error: 'Only voters can apply to be organizer' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = organizerApplicationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }
    const { company, website, bio, phone, email, id_type, id_number } = parseResult.data;

    const { data: existing } = await supabase
      .from('organizer_applications')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You already have an active organizer application' }, { status: 409 });
    }

    // Insert application into organizer_applications table
    const firstAttempt = await supabase.from('organizer_applications').insert({
      user_id: user.id,
      company,
      website,
      bio,
      phone,
      email: email || dbUser.email,
      id_type,
      id_number,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });

    if (firstAttempt.error) {
      const fallbackAttempt = await supabase.from('organizer_applications').insert({
        company,
        website,
        bio,
        phone,
        email: email || dbUser.email,
        id_type,
        id_number,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });

      if (fallbackAttempt.error) {
        return NextResponse.json({ error: 'Database error', details: fallbackAttempt.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ message: 'Application submitted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
