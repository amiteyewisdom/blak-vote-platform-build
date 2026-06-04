import type { Metadata } from 'next'
import { getSupabaseAdminClient } from '@/lib/server-security'

const DEFAULT_TITLE = 'BlakVote public event'
const DEFAULT_DESCRIPTION = 'Join this BlakVote event to vote, follow results, and participate in public online contests.'
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://blakvote.com'
const DEFAULT_IMAGE = `${SITE_ORIGIN.replace(/\/$/, '')}/site-logo.png`

function normalizeImageUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return `${SITE_ORIGIN.replace(/\/$/, '')}${trimmed}`
  }

  return `${SITE_ORIGIN.replace(/\/$/, '')}/${trimmed.replace(/^\/+/, '')}`
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { eventId: string }
}): Promise<Metadata> {
  const eventCode = String(params.eventId || '').trim()
  const metadataBase = new URL(SITE_ORIGIN)

  if (!eventCode) {
    return {
      metadataBase,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: SITE_ORIGIN,
        images: [{ url: DEFAULT_IMAGE, alt: 'BlakVote logo' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [DEFAULT_IMAGE],
      },
    }
  }

  try {
    const supabase = getSupabaseAdminClient()
    const [byEventCode, byShortCode, byId] = await Promise.all([
      supabase
        .from('events')
        .select('id,title,description,image_url,banner_url')
        .ilike('event_code', eventCode)
        .maybeSingle(),
      supabase
        .from('events')
        .select('id,title,description,image_url,banner_url')
        .ilike('short_code', eventCode)
        .maybeSingle(),
      supabase
        .from('events')
        .select('id,title,description,image_url,banner_url')
        .eq('id', eventCode)
        .maybeSingle(),
    ])

    const event = byEventCode.data ?? byShortCode.data ?? byId.data
    const title = event?.title ? `${event.title} | BlakVote` : DEFAULT_TITLE
    const description = event?.description?.trim() || DEFAULT_DESCRIPTION
    const imageUrl = normalizeImageUrl(event?.image_url || event?.banner_url) || DEFAULT_IMAGE

    return {
      metadataBase,
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_ORIGIN.replace(/\/$/, '')}/events/${encodeURIComponent(eventCode)}`,
        images: [{ url: imageUrl, alt: event?.title ? `${event.title} image` : 'BlakVote event image' }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    }
  } catch (error) {
    console.error('[EventMetadata] Failed to load event metadata:', error)

    return {
      metadataBase,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: `${SITE_ORIGIN.replace(/\/$/, '')}/events/${encodeURIComponent(eventCode)}`,
        images: [{ url: DEFAULT_IMAGE, alt: 'BlakVote logo' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [DEFAULT_IMAGE],
      },
    }
  }
}
