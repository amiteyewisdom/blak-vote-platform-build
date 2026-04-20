import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

type FileLike = {
  name?: string
  type?: string
  size?: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

type ParsedNominationPayload = {
  eventId: string
  nomineeName: string
  nomineeEmail: string | null
  nomineePhone: string | null
  bio: string | null
  categoryId: string | null
  imageFile: FileLike | null
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function isFileLike(value: unknown): value is FileLike {
  return (
    !!value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  )
}

async function parsePayload(req: NextRequest): Promise<ParsedNominationPayload> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const imageValue = form.get('image')
    return {
      eventId: String(form.get('eventId') || '').trim(),
      nomineeName: String(form.get('nomineeName') || '').trim(),
      nomineeEmail: normalizeText(form.get('nomineeEmail')),
      nomineePhone: normalizeText(form.get('nomineePhone')),
      bio: normalizeText(form.get('bio')),
      categoryId: normalizeText(form.get('categoryId')),
      imageFile: isFileLike(imageValue) ? imageValue : null,
    }
  }

  const body = await req.json()
  return {
    eventId: String(body.eventId || '').trim(),
    nomineeName: String(body.nomineeName || '').trim(),
    nomineeEmail: normalizeText(body.nomineeEmail),
    nomineePhone: normalizeText(body.nomineePhone),
    bio: normalizeText(body.bio),
    categoryId: normalizeText(body.categoryId),
    imageFile: null,
  }
}

async function uploadNomineeImage(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  eventId: string,
  imageFile: FileLike
) {
  const mimeType = String(imageFile.type || '')
  if (!mimeType.startsWith('image/')) {
    throw new Error('Only image files are allowed')
  }

  const maxSizeBytes = 5 * 1024 * 1024
  const imageSize = Number(imageFile.size || 0)
  if (imageSize > maxSizeBytes) {
    throw new Error('Image must be 5MB or smaller')
  }

  const fileName = String(imageFile.name || 'nominee.jpg')
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'
  const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const bytes = await imageFile.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('nominee-images')
    .upload(path, bytes, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: publicUrlData } = supabase.storage.from('nominee-images').getPublicUrl(path)
  return publicUrlData.publicUrl
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdminClient()
  try {
    const payload = await parsePayload(req)
    const { eventId, nomineeName, nomineeEmail, nomineePhone, bio, categoryId, imageFile } = payload

    if (!eventId || !nomineeName) {
      return NextResponse.json({ error: 'eventId and nomineeName are required' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, status, organizer_id')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!['active', 'pending', 'published'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not accepting nominations' }, { status: 403 })
    }

    let categories: Array<{ id: string; event_id: string }> = []
    const { data: fetchedCategories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, event_id')
      .eq('event_id', event.id)

    // Keep nominations working even if categories table/column drift exists in an environment.
    if (!categoriesError) {
      categories = (fetchedCategories ?? []) as Array<{ id: string; event_id: string }>
    }

    const hasCategories = categories.length > 0
    if (hasCategories && !categoryId) {
      return NextResponse.json({ error: 'Please choose a category for this nomination' }, { status: 400 })
    }

    if (categoryId && hasCategories) {
      const validCategory = categories.some((c) => c.id === categoryId && c.event_id === event.id)
      if (!validCategory) {
        return NextResponse.json({ error: 'Selected category is invalid for this event' }, { status: 400 })
      }
    }

    let photoUrl: string | null = null
    if (imageFile) {
      try {
        photoUrl = await uploadNomineeImage(supabase, event.id, imageFile)
      } catch (imageError: any) {
        return NextResponse.json({ error: imageError?.message || 'Image upload failed' }, { status: 400 })
      }
    }

    const nominatedByUserId = String(event.organizer_id || '').trim() || null

    const payloadVariants: Array<Record<string, unknown>> = [
      {
        event_id: event.id,
        nominee_name: nomineeName,
        nominee_email: nomineeEmail || null,
        nominee_phone: nomineePhone || null,
        bio: bio || null,
        category_id: categoryId,
        photo_url: photoUrl,
        nominated_by_user_id: nominatedByUserId,
        status: 'pending',
        vote_count: 0,
      },
      {
        event_id: event.id,
        nominee_name: nomineeName,
        nominee_email: nomineeEmail || null,
        nominee_phone: nomineePhone || null,
        bio: bio || null,
        category_id: categoryId,
        photo_url: photoUrl,
        nominated_by_user_id: nominatedByUserId,
        status: 'pending',
      },
      {
        event_id: event.id,
        nominee_name: nomineeName,
        bio: bio || null,
        category_id: categoryId,
        photo_url: photoUrl,
        nominated_by_user_id: nominatedByUserId,
        status: 'pending',
      },
      {
        event_id: event.id,
        nominee_name: nomineeName,
        category_id: categoryId,
        status: 'pending',
      },
      {
        event_id: event.id,
        nominee_name: nomineeName,
        status: 'pending',
      },
    ]

    let insertCode: string | null = null
    let insertError: any = null

    for (const insertPayload of payloadVariants) {
      const attempt = await supabase
        .from('nominations')
        .insert(insertPayload)
        .select()
        .maybeSingle()

      if (!attempt.error) {
        const row = attempt.data as Record<string, unknown> | null
        insertCode =
          (row?.short_code as string | null) ||
          (row?.voting_code as string | null) ||
          null
        insertError = null
        break
      }

      insertError = attempt.error
      if (insertError) {
        console.error('[nominations] insert attempt failed', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
          payloadKeys: Object.keys(insertPayload),
        })
      }
    }

    if (insertError) {
      return NextResponse.json(
        {
          error: insertError.message || 'Unable to submit nomination',
          details: insertError.details || null,
          hint: insertError.hint || null,
          code: insertError.code || null,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      code: insertCode,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error?.message || null,
      },
      { status: 500 }
    )
  }
}
