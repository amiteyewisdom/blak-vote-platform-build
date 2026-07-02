import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NOMINEE_CODE_CONFLICT_PATTERN = /(short_code|voting_code|idx_nominations_short_code_unique|idx_nominations_voting_code_unique)/i

function isInvalidId(value: unknown): boolean {
  const normalized = String(value || '').trim()
  return !normalized || normalized === 'undefined' || normalized === 'null'
}

function toPublicNomineeImageUrl(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const value = rawValue.trim()
  if (!value) {
    return null
  }

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  const supabaseBaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''

  if (!supabaseBaseUrl) {
    return value
  }

  const normalizedBase = supabaseBaseUrl.replace(/\/$/, '')
  const storagePath = value
    .replace(/^\/?storage\/v1\/object\/public\/nominee-images\//, '')
    .replace(/^\/?nominee-images\//, '')

  return `${normalizedBase}/storage/v1/object/public/nominee-images/${storagePath}`
}

function resolveNomineePhotoUrl(nominee: Record<string, any>): string | null {
  const candidates = [
    nominee.photo_url,
    nominee.image_url,
    nominee.nominee_image_url,
    nominee.nominee_photo_url,
    nominee.nominee_photo,
    nominee.photo,
    nominee.image,
    nominee.avatar_url,
  ]

  for (const value of candidates) {
    const normalized = toPublicNomineeImageUrl(value)
    if (normalized) {
      return normalized
    }
  }

  return null
}

async function insertNomineeWithRetry(
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>,
  payload: Record<string, unknown>,
  maxAttempts = 5
) {
  let lastError: any = null

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attempt = await adminSupabase
      .from('nominations')
      .insert(payload)
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!attempt.error) {
      return { data: attempt.data ?? null, error: null }
    }

    lastError = attempt.error
    const code = String(lastError?.code || '')
    const detailText = `${String(lastError?.message || '')} ${String(lastError?.details || '')} ${String(lastError?.hint || '')}`
    const isRetryableCodeConflict = code === '23505' && NOMINEE_CODE_CONFLICT_PATTERN.test(detailText)

    if (!isRetryableCodeConflict) {
      break
    }
  }

  return { data: null, error: lastError }
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

  const [{ data: categories, error: categoriesError }, { data: nominees, error: nomineesError }, { data: eventRow }] = await Promise.all([
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
    adminSupabase
      .from('events')
      .select('image_url, banner_url')
      .eq('id', eventId)
      .maybeSingle(),
  ])

  if (categoriesError || nomineesError) {
    return NextResponse.json({ error: categoriesError?.message || nomineesError?.message || 'Failed to load nominees' }, { status: 500 })
  }

  const eventFallbackImage = (eventRow as Record<string, unknown> | null)?.image_url as string | null
    ?? (eventRow as Record<string, unknown> | null)?.banner_url as string | null
    ?? null

  const normalizedNominees = (nominees ?? []).map((nominee: Record<string, any>) => ({
    ...nominee,
    photo_url: resolveNomineePhotoUrl(nominee),
  }))

  return NextResponse.json({ categories: categories ?? [], nominees: normalizedNominees, eventFallbackImage })
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

  // Keep create flow working on mixed-schema deployments where category lookups
  // can fail; only hard-fail when a category row is returned but mismatched.
  if (!categoryError && category && category.event_id !== eventId) {
    return NextResponse.json({ error: 'Invalid category for event' }, { status: 400 })
  }

  const uuidRef = crypto.randomUUID()

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
      status: 'pending',
      uuid_ref: uuidRef,
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
      uuid_ref: uuidRef,
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
      status: 'candidate',
      uuid_ref: uuidRef,
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
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      nominee_photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      nominee_email: null,
      nominee_phone: null,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      vote_count: 0,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      image_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      bio: bio || null,
      category_id: categoryId,
      photo_url: photoUrl,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      nominated_by_user_id: auth.userId,
      status: 'pending',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      nominated_by_user_id: auth.userId,
      status: 'candidate',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      nominated_by_user_id: auth.userId,
      status: 'approved',
      uuid_ref: uuidRef,
    },
    {
      event_id: eventId,
      nominee_name: nomineeName,
      category_id: categoryId,
      uuid_ref: uuidRef,
    },
  ]

  // Organizer/admin direct creation must go live immediately.
  // Public nominations use /api/nominations and remain pending.
  const statusPriority = ['candidate', 'approved']

  const prioritizedPayloadVariants = [...payloadVariants]
    .filter((payload) => statusPriority.includes(String(payload.status || '')))
    .sort((left, right) => {
    const leftStatus = String(left.status || '')
    const rightStatus = String(right.status || '')
    const leftIndex = statusPriority.indexOf(leftStatus)
    const rightIndex = statusPriority.indexOf(rightStatus)
    const normalizedLeft = leftIndex === -1 ? statusPriority.length : leftIndex
    const normalizedRight = rightIndex === -1 ? statusPriority.length : rightIndex
    return normalizedLeft - normalizedRight
  })

  if (prioritizedPayloadVariants.length === 0) {
    return NextResponse.json({ error: 'Nominee payload configuration error' }, { status: 500 })
  }

  let insertError: any = null

  for (const payload of prioritizedPayloadVariants) {
    const insertAttempt = await insertNomineeWithRetry(adminSupabase, payload)

    if (!insertAttempt.error) {
      return NextResponse.json({ nominee: insertAttempt.data ?? null, success: true })
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

export async function PATCH(request: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['organizer', 'admin'])
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const nomineeId = String(body.id || '')
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

  const updatePayload: Record<string, unknown> = {}
  if ('nominee_name' in body) updatePayload.nominee_name = String(body.nominee_name || '').trim() || null
  if ('nominee_email' in body) updatePayload.nominee_email = body.nominee_email ? String(body.nominee_email).trim() : null
  if ('nominee_phone' in body) updatePayload.nominee_phone = body.nominee_phone ? String(body.nominee_phone).trim() : null
  if ('bio' in body) updatePayload.bio = String(body.bio || '').trim() || null
  if ('photo_url' in body) updatePayload.photo_url = body.photo_url ? String(body.photo_url) : null
  if ('category_id' in body) updatePayload.category_id = String(body.category_id || '') || null
  if ('status' in body) updatePayload.status = String(body.status || '')

  updatePayload.updated_at = new Date().toISOString()

  if (Object.keys(updatePayload).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from('nominations')
    .update(updatePayload)
    .eq('id', nomineeId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ nominee: { ...data, photo_url: resolveNomineePhotoUrl(data) }, success: true })
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
