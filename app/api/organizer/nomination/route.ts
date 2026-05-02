import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth';

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

const nominationSchema = z.object({
  nomination_id: z.string().min(1),
  approve: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const sessionClient = await createServerClient();
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin credentials are not configured' }, { status: 500 });
    }

    const auth = await requireRole(sessionClient, ['admin', 'organizer']);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const parseResult = nominationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }

    const { nomination_id, approve } = parseResult.data;

    const { data: nomination, error: nominationError } = await supabase
      .from('nominations')
      .select('event_id')
      .eq('id', nomination_id)
      .maybeSingle();

    if (nominationError || !nomination) {
      return NextResponse.json({ error: 'Nomination not found' }, { status: 404 });
    }

    if (auth.role === 'organizer') {
      const ownershipError = await ensureEventOwnedByOrganizer(
        supabase,
        nomination.event_id,
        auth.userId
      );

      if (ownershipError) {
        return ownershipError;
      }
    }

    const { error } = await supabase
      .from('nominations')
      .update({ status: approve ? 'candidate' : 'rejected' })
      .eq('id', nomination_id);
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: `Nomination ${approve ? 'approved' : 'declined'} successfully` });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
