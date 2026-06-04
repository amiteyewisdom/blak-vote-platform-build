import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildEventMetadata } from '@/lib/event-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  return await buildEventMetadata(params.eventId)
}

export default function EventSegmentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
