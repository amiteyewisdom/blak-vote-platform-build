import type { Metadata } from 'next'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { MAIN_SITE_ORIGIN } from '@/lib/site-metadata'

const DEFAULT_TITLE = 'BlakVote public event'
const DEFAULT_DESCRIPTION = 'Join this BlakVote event to vote, follow results, and participate in public online contests.'
const SITE_ORIGIN = MAIN_SITE_ORIGIN
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const DEFAULT_IMAGE = `${SITE_ORIGIN.replace(/\/$/, '')}/site-logo.png`

type EventMetadataRow = {
  id?: string
  title?: string
  description?: string
  image_url?: string | null
  banner_url?: string | null
  banner_image_url?: string | null
  event_code?: string | null
  short_code?: string | null
}

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

export async function buildEventMetadata(eventCode: string): Promise<Metadata> {
  const normalizedEventCode = String(eventCode || '').trim()
  const metadataBase = new URL(SITE_ORIGIN)
  const baseOrigin = metadataBase.origin

  if (!normalizedEventCode) {
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
    console.log('[META] buildEventMetadata start', { eventCode: normalizedEventCode })
    const supabase = getSupabaseAdminClient()
    console.log('[META] Supabase admin client initialized')

    const [byEventCode, byShortCode, byId] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .ilike('event_code', normalizedEventCode)
        .maybeSingle(),
      supabase
        .from('events')
        .select('*')
        .ilike('short_code', normalizedEventCode)
        .maybeSingle(),
      supabase
        .from('events')
        .select('*')
        .eq('id', normalizedEventCode)
        .maybeSingle(),
    ])

    console.log('[META] byEventCode:', {
      data: byEventCode.data ? { id: byEventCode.data.id, title: byEventCode.data.title } : null,
      error: byEventCode.error?.message ?? null,
    })
    console.log('[META] byShortCode:', {
      data: byShortCode.data ? { id: byShortCode.data.id, title: byShortCode.data.title } : null,
      error: byShortCode.error?.message ?? null,
    })
    console.log('[META] byId:', {
      data: byId.data ? { id: byId.data.id, title: byId.data.title } : null,
      error: byId.error?.message ?? null,
    })

    const event = byEventCode.data ?? byShortCode.data ?? byId.data
    console.log('[META] selected event:', event ? { id: event.id, title: event.title } : null)

    const title = event?.title ? `${event.title} | BlakVote` : DEFAULT_TITLE
    const description = event?.description?.trim() || DEFAULT_DESCRIPTION
    const imageUrl = normalizeImageUrl(event?.image_url || event?.banner_image_url || event?.banner_url) || DEFAULT_IMAGE
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(normalizedEventCode)}`
    const metadata = {
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

    console.log('[META RESULT]', metadata)
    return metadata
  } catch (error) {
    console.error('[META ERROR]', error)
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(normalizedEventCode)}`

    const fallbackMetadata = {
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

    console.log('[META RESULT]', fallbackMetadata)
    return fallbackMetadata
  }
}
