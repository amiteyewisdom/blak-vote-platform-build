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
    console.log('[META] normalizeImageUrl: null or non-string value')
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    console.log('[META] normalizeImageUrl: empty string after trim')
    return null
  }

  console.log('[META] normalizeImageUrl input:', trimmed)

  // If already a full URL, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    console.log('[META] normalizeImageUrl: already a full URL, returning as-is')
    return trimmed
  }

  const looksLikeSupabasePath = /storage\/v1|nominee-images|event-images|uploads\//i.test(trimmed)
  console.log('[META] normalizeImageUrl: looksLikeSupabasePath:', looksLikeSupabasePath, 'SUPABASE_URL:', SUPABASE_URL)

  // Handle absolute paths
  if (/^\//.test(trimmed)) {
    if (looksLikeSupabasePath && SUPABASE_URL) {
      // For Supabase storage, ensure we use the public URL
      if (trimmed.includes('/storage/v1/object/public/')) {
        const result = `${SUPABASE_URL}${trimmed}`
        console.log('[META] normalizeImageUrl: public path detected, result:', result)
        return result
      }
      // Try to construct public URL for storage paths
      const publicPath = trimmed.replace(/^\/+/, '')
      if (publicPath.startsWith('storage/v1/')) {
        const result = `${SUPABASE_URL}/${publicPath}`
        console.log('[META] normalizeImageUrl: storage/v1 path, result:', result)
        return result
      }
      const result = `${SUPABASE_URL}${trimmed}`
      console.log('[META] normalizeImageUrl: other Supabase path, result:', result)
      return result
    }
    const result = `${SITE_ORIGIN.replace(/\/$/, '')}${trimmed}`
    console.log('[META] normalizeImageUrl: absolute path with origin, result:', result)
    return result
  }

  // Handle relative paths
  if (looksLikeSupabasePath && SUPABASE_URL) {
    const cleanPath = trimmed.replace(/^\/+/, '')
    if (cleanPath.startsWith('storage/v1/')) {
      const result = `${SUPABASE_URL}/${cleanPath}`
      console.log('[META] normalizeImageUrl: relative storage path, result:', result)
      return result
    }
    const result = `${SUPABASE_URL}/${cleanPath}`
    console.log('[META] normalizeImageUrl: relative Supabase path, result:', result)
    return result
  }

  const result = `${SITE_ORIGIN.replace(/\/$/, '')}/${trimmed.replace(/^\/+/, '')}`
  console.log('[META] normalizeImageUrl: relative path with origin, result:', result)
  return result
}

export async function buildEventMetadata(eventCode: string): Promise<Metadata> {
  console.log('[META] buildEventMetadata called with:', { eventCode, type: typeof eventCode, length: String(eventCode).length })
  
  const normalizedEventCode = String(eventCode || '').trim()
  console.log('[META] normalizedEventCode:', { normalizedEventCode, length: normalizedEventCode.length, isEmpty: !normalizedEventCode })
  
  const metadataBase = new URL(SITE_ORIGIN)
  const baseOrigin = metadataBase.origin
  console.log('[META] baseOrigin:', baseOrigin)

  if (!normalizedEventCode) {
    console.log('[META] EARLY RETURN: normalizedEventCode is empty, returning default metadata')
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
    console.log('[META] buildEventMetadata try block: starting Supabase lookup')
    const supabase = getSupabaseAdminClient()
    console.log('[META] Supabase admin client initialized')

    console.log('[META] executing queries with normalizedEventCode:', normalizedEventCode)
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

    console.log('[META] query results received')
    console.log('[META] byEventCode.data:', byEventCode.data ? { id: byEventCode.data.id, title: byEventCode.data.title } : null, 'error:', byEventCode.error?.message)
    console.log('[META] byShortCode.data:', byShortCode.data ? { id: byShortCode.data.id, title: byShortCode.data.title } : null, 'error:', byShortCode.error?.message)
    console.log('[META] byId.data:', byId.data ? { id: byId.data.id, title: byId.data.title } : null, 'error:', byId.error?.message)

    const event = byEventCode.data ?? byShortCode.data ?? byId.data
    console.log('[META] selected event:', event ? { id: event.id, title: event.title, image_url: event.image_url } : null)

    const title = event?.title ? `${event.title} | BlakVote` : DEFAULT_TITLE
    const description = event?.description?.trim() || DEFAULT_DESCRIPTION
    const imageUrl = normalizeImageUrl(event?.image_url || event?.banner_image_url || event?.banner_url) || DEFAULT_IMAGE
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(normalizedEventCode)}`

    // Ensure image URL is absolute and properly formatted for social media
    const absoluteImageUrl = imageUrl.startsWith('http') ? imageUrl : `${baseOrigin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`

    const metadata = {
      metadataBase,
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: 'website',
        siteName: 'BlakVote',
        title,
        description,
        url: canonicalUrl,
        images: [
          {
            url: absoluteImageUrl,
            width: 1200,
            height: 630,
            alt: event?.title ? `${event.title} event image` : 'BlakVote event image',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [absoluteImageUrl],
      },
      // Additional meta tags for better social media support
      other: {
        'og:type': 'website',
        'og:site_name': 'BlakVote',
        'twitter:card': 'summary_large_image',
      },
    }

    console.log('[META] returning metadata:', { 
      title: metadata.title, 
      canonical: metadata.alternates?.canonical,
      ogImage: metadata.openGraph?.images?.[0]?.url,
      twitterImage: metadata.twitter?.images?.[0]
    })
    return metadata
  } catch (error) {
    console.error('[META] CAUGHT ERROR in buildEventMetadata:', error instanceof Error ? { message: error.message, stack: error.stack } : error)
    const canonicalUrl = `${baseOrigin}/events/${encodeURIComponent(normalizedEventCode)}`

    const fallbackMetadata = {
      metadataBase,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: 'website',
        siteName: 'BlakVote',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: canonicalUrl,
        images: [
          {
            url: DEFAULT_IMAGE,
            width: 1200,
            height: 630,
            alt: 'BlakVote logo',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [DEFAULT_IMAGE],
      },
      other: {
        'og:type': 'website',
        'og:site_name': 'BlakVote',
        'twitter:card': 'summary_large_image',
      },
    }

    console.log('[META] returning fallback metadata due to error')
    return fallbackMetadata
  }
}
