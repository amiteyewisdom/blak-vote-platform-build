import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

const SUPPORTED_NOMINEE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/heic', 'image/heif']
const MAX_NOMINEE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

function isInvalidId(value: unknown): boolean {
  const normalized = String(value || '').trim()
  return !normalized || normalized === 'undefined' || normalized === 'null'
}

export async function POST(req: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['organizer', 'admin'])
    if (!auth.ok) {
      return auth.response
    }

    const formData = await req.formData()
    const eventId = String(formData.get('eventId') || '')
    const file = formData.get('image')

    if (isInvalidId(eventId)) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    const mimeType = String(file.type || '')
    if (!SUPPORTED_NOMINEE_IMAGE_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported image format. Use JPG, PNG, or WebP.' },
        { status: 400 }
      )
    }

    if (Number(file.size || 0) > MAX_NOMINEE_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 })
    }

    const adminSupabase = getSupabaseAdminClient()

    if (auth.role === 'organizer') {
      const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
      if (ownershipError) {
        return ownershipError
      }
    }

    const originalName = String(file.name || 'nominee-image.jpg')
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'jpg'
    const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await adminSupabase.storage
      .from('nominee-images')
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        {
          error: uploadError.message,
          hint: 'Check that the nominee-images bucket exists and accepts JPG/PNG/WebP uploads.',
        },
        { status: 400 }
      )
    }

    const { data: publicUrlData } = adminSupabase.storage.from('nominee-images').getPublicUrl(path)

    return NextResponse.json({ imageUrl: publicUrlData.publicUrl, path }, { status: 200 })
  } catch (error) {
    console.error('Organizer nominee image upload error:', error)
    return NextResponse.json({ error: 'Failed to upload nominee image' }, { status: 500 })
  }
}
