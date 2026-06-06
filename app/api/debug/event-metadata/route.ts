import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { buildEventMetadata } from '@/lib/event-metadata'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')

    if (!eventCode) {
      return NextResponse.json({ error: 'Missing eventCode' }, { status: 400 })
    }

    // First, fetch the event directly to see what data we have
    const supabase = getSupabaseAdminClient()
    const [byEventCode, byShortCode, byId] = await Promise.all([
      supabase.from('events').select('*').ilike('event_code', eventCode).maybeSingle(),
      supabase.from('events').select('*').ilike('short_code', eventCode).maybeSingle(),
      supabase.from('events').select('*').eq('id', eventCode).maybeSingle(),
    ])

    const event = byEventCode.data ?? byShortCode.data ?? byId.data

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Build the metadata
    const metadata = await buildEventMetadata(eventCode)

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        event_code: event.event_code,
        short_code: event.short_code,
        image_url: event.image_url,
        banner_url: event.banner_url,
        banner_image_url: event.banner_image_url,
        description: event.description,
      },
      metadata: {
        title: metadata.title,
        description: metadata.description,
        canonical: metadata.alternates?.canonical,
        openGraph: {
          title: metadata.openGraph?.title,
          description: metadata.openGraph?.description,
          url: metadata.openGraph?.url,
          images: metadata.openGraph?.images,
        },
        twitter: {
          title: metadata.twitter?.title,
          description: metadata.twitter?.description,
          images: metadata.twitter?.images,
        },
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
