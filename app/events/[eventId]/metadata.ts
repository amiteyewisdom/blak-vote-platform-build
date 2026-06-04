import type { Metadata } from 'next'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { MAIN_SITE_ORIGIN } from '@/lib/site-metadata'

const DEFAULT_TITLE = 'BlakVote public event'
const DEFAULT_DESCRIPTION = 'Join this BlakVote event to vote, follow results, and participate in public online contests.'
const SITE_ORIGIN = MAIN_SITE_ORIGIN
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
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

  const looksLikeSupabasePath = /storage\/v1|nominee-images|event-images|uploads\//i.test(trimmed)

  if (/^\//.test(trimmed)) {
    if (looksLikeSupabasePath && SUPABASE_URL) {
      return `${SUPABASE_URL}${trimmed}`
    }
    return `${SITE_ORIGIN.replace(/\/$/, '')}${trimmed}`
  }

  if (looksLikeSupabasePath && SUPABASE_URL) {
    return `${SUPABASE_URL}/${trimmed.replace(/^\/+/, '')}`
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
  const baseOrigin = metadataBase.origin

  if (!eventCode) {
    return {
      metadataBase,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      alternates: {
        canonical: `${baseOrigin}/events`,
      },
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: `${baseOrigin}/events`,
        images: [{ url: DEFAULT_IMAGE, alt: 'BlakVote logo' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [{ url: DEFAULT_IMAGE }],
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
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(eventCode)}`

    return {
      metadataBase,
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        images: [{ url: imageUrl, alt: event?.title ? `${event.title} image` : 'BlakVote event image' }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [{ url: imageUrl }],
      },
    }
  } catch (error) {
    console.error('[EventMetadata] Failed to load event metadata:', error)
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(eventCode)}`

    return {
      metadataBase,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: canonicalUrl,
        images: [{ url: DEFAULT_IMAGE, alt: 'BlakVote logo' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [{ url: DEFAULT_IMAGE }],
      },
    }
  }
}
