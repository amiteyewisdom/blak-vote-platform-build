import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { requireRole } from '@/lib/api-auth';

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

const organizerApplicationSchema = z.object({
  organization_name: z.string().trim().min(2),
  organization_id: z.string().trim().min(3).optional().or(z.literal('')),
  address: z.string().trim().min(5),
  phone_number: z.string().trim().min(7),
  description: z.string().trim().min(10),
});

export async function POST(req: Request) {
  try {
    const sessionClient = await createServerClient();
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin credentials are not configured' }, { status: 500 });
    }

    const auth = await requireRole(sessionClient, ['voter']);
    if (!auth.ok) {
      return auth.response;
    }

    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', auth.userId)
      .maybeSingle();

    if (userError || !dbUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (dbUser.role !== 'voter') {
      return NextResponse.json({ error: 'Only voters can apply to be organizer' }, { status: 403 });
    }

    const formData = await req.formData();
    const parseResult = organizerApplicationSchema.safeParse({
      organization_name: formData.get('organizationName'),
      organization_id: formData.get('organizationId'),
      address: formData.get('address'),
      phone_number: formData.get('phoneNumber'),
      description: formData.get('description'),
    });
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.errors }, { status: 400 });
    }

    const document = formData.get('document');
    if (!(document instanceof File) || document.size === 0) {
      return NextResponse.json({ error: 'A supporting document is required.' }, { status: 400 });
    }

    if (document.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Supporting document must be 5MB or smaller.' }, { status: 400 });
    }

    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(document.type)) {
      return NextResponse.json({ error: 'Only PDF, JPG, PNG, or WEBP files are allowed.' }, { status: 400 });
    }

    const { organization_name, organization_id, address, phone_number, description } = parseResult.data;
    const normalizedOrganizationId = typeof organization_id === 'string' && organization_id.trim().length > 0
      ? organization_id.trim()
      : null;

    const { data: existing } = await supabase
      .from('organizer_applications')
      .select('id, status')
      .eq('user_id', auth.userId)
      .in('status', ['pending', 'approved'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You already have an active organizer application' }, { status: 409 });
    }

    const fileExtension = document.name.includes('.') ? document.name.split('.').pop()?.toLowerCase() || 'bin' : 'bin';
    const storagePath = `${auth.userId}/${Date.now()}-${randomUUID()}.${fileExtension}`;
    const upload = await supabase.storage
      .from('organizer-documents')
      .upload(storagePath, Buffer.from(await document.arrayBuffer()), {
        contentType: document.type,
        upsert: false,
      });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message || 'Failed to upload document.' }, { status: 500 });
    }

    const insertResult = await supabase.from('organizer_applications').insert({
      user_id: auth.userId,
      organization_name,
      organization_id: normalizedOrganizationId,
      address,
      phone_number,
      description,
      document_url: storagePath,
      status: 'pending',
      created_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      company: organization_name,
      bio: description,
      phone: phone_number,
      email: dbUser.email,
      id_type: 'Ghana Card or Voter ID',
      id_number: normalizedOrganizationId,
    });

    if (insertResult.error) {
      return NextResponse.json({ error: 'Database error', details: insertResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Application submitted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error }, { status: 500 });
  }
}
