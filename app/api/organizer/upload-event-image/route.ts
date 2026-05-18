import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

const SUPPORTED_EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_EVENT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['organizer', 'admin'])
    if (!auth.ok) {
      return auth.response
    }

    const formData = await req.formData()
    const file = formData.get('image')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    const mimeType = String(file.type || '')
    if (!SUPPORTED_EVENT_IMAGE_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported image format. Use JPG, PNG, or WebP.' },
        { status: 400 }
      )
    }

    if (Number(file.size || 0) > MAX_EVENT_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 })
    }

    const originalName = String(file.name || 'event-image.jpg')
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'jpg'
    const path = `${auth.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const adminSupabase = getSupabaseAdminClient()
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await adminSupabase.storage
      .from('event-images')
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        {
          error: uploadError.message,
          hint: 'Check that the event-images bucket exists and accepts JPG/PNG/WebP uploads.',
        },
        { status: 400 }
      )
    }

    const { data: publicUrlData } = adminSupabase.storage.from('event-images').getPublicUrl(path)

    return NextResponse.json({ imageUrl: publicUrlData.publicUrl, path }, { status: 200 })
  } catch (error) {
    console.error('Organizer event image upload error:', error)
    return NextResponse.json({ error: 'Failed to upload event image' }, { status: 500 })
  }
}
