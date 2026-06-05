import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildEventMetadata } from '@/lib/event-metadata'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const eventId = String(params?.eventId || '').trim()
  const metadata = await buildEventMetadata(eventId)
  
  // Override title for tickets page
  return {
    ...metadata,
    title: metadata.title?.replace(' | BlakVote', ' Tickets | BlakVote') || 'Event Tickets | BlakVote',
  }
}

export default function TicketsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
