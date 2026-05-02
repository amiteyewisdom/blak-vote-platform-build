import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
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

const codeSchema = z.object({
  type: z.enum(['event', 'nominee']),
  id: z.string().min(1),
});

function generateUniqueCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

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
    const parseResult = codeSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }

    const { type, id } = parseResult.data;

    if (type === 'event' && auth.role === 'organizer') {
      const ownershipError = await ensureEventOwnedByOrganizer(supabase, id, auth.userId);
      if (ownershipError) {
        return ownershipError;
      }
    }

    const code = generateUniqueCode();
    const table = type === 'event' ? 'events' : 'nominations';
    const primaryColumn = type === 'event' ? 'event_code' : 'voting_code';
    const updatePayload =
      type === 'event'
        ? { event_code: code, short_code: code }
        : { voting_code: code, short_code: code };

    const { error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', id);
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} code generated`, code });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
