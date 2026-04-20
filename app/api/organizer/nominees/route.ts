import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

function isInvalidId(value: unknown): boolean {
  const normalized = String(value || '').trim()
  return !normalized || normalized === 'undefined' || normalized === 'null'
}

export async function GET(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const eventId = new URL(request.url).searchParams.get('eventId')
  if (isInvalidId(eventId)) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, String(eventId), auth.userId)
    if (ownershipError) return ownershipError
  }

  const [{ data: categories, error: categoriesError }, { data: nominees, error: nomineesError }] = await Promise.all([
    adminSupabase
      .from('categories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('nominations')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
  ])

  if (categoriesError || nomineesError) {
    return NextResponse.json({ error: categoriesError?.message || nomineesError?.message || 'Failed to load nominees' }, { status: 500 })
  }

  return NextResponse.json({ categories: categories ?? [], nominees: nominees ?? [] })
}

export async function POST(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const eventId = String(body.eventId || '')
  const nomineeName = String(body.nomineeName || '').trim()
  const categoryId = String(body.categoryId || '').trim()
  const bio = String(body.bio || '').trim()
  const photoUrl = body.photoUrl ? String(body.photoUrl) : null

  if (isInvalidId(eventId) || !nomineeName || !categoryId) {
    return NextResponse.json({ error: 'eventId, nomineeName and categoryId are required' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
    if (ownershipError) return ownershipError
  }

  const { data: category, error: categoryError } = await adminSupabase
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()

  if (categoryError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Invalid category for event' }, { status: 400 })
  }

  const payloadVariants: Array<Record<string, unknown>> = [
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'approved',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'approved',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      status: 'candidate',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      status: 'approved',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      nominated_by_user_id: auth.userId,
      status: 'approved',
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
    },
  ]

  let insertError: any = null

  for (const payload of payloadVariants) {
    const insertAttempt = await adminSupabase
      .from('nominations')
      .insert(payload)

    if (!insertAttempt.error) {
      // Fetching the inserted row can fail on some deployments even when insert succeeded.
      const lookup = await adminSupabase
        .from('nominations')
        .select('*')
        .eq('event_id', eventId)
        .eq('nominee_name', nomineeName)
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return NextResponse.json({ nominee: lookup.data ?? null, success: true })
    }

    insertError = insertAttempt.error
  }

  return NextResponse.json(
    {
      error:
        insertError?.code === '42703'
          ? 'Nominee categories are not enabled in database yet. Run the latest migrations.'
          : insertError?.message || 'Unable to create nominee',
      details: insertError?.details || null,
      hint: insertError?.hint || null,
      code: insertError?.code || null,
    },
    { status: 400 }
  )
}

export async function DELETE(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const nomineeId = new URL(request.url).searchParams.get('id')
  if (!nomineeId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: nominee, error: nomineeError } = await adminSupabase
    .from('nominations')
    .select('id, event_id')
    .eq('id', nomineeId)
    .maybeSingle()

  if (nomineeError || !nominee) {
    return NextResponse.json({ error: 'Nominee not found' }, { status: 404 })
  }

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, nominee.event_id, auth.userId)
    if (ownershipError) return ownershipError
  }

  const { error } = await adminSupabase.from('nominations').delete().eq('id', nomineeId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
