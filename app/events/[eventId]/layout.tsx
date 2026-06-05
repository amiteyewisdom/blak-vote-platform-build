import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildEventMetadata } from '@/lib/event-metadata'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  console.log('[META] layout.generateMetadata called', { params })
  const eventId = String(params?.eventId || '').trim()
  console.log('[META] layout.generateMetadata eventId:', eventId)

  const metadata = await buildEventMetadata(eventId)
  console.log('[META] layout.generateMetadata result:', {
    title: metadata.title,
    canonical: metadata.alternates?.canonical,
    openGraphUrl: metadata.openGraph?.url,
    image: metadata.openGraph?.images?.[0]?.url,
  })

  return metadata
}

export default function EventSegmentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
