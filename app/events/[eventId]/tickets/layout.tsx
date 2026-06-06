import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildEventMetadata } from '@/lib/event-metadata'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const resolvedParams = await params
  const eventId = String(resolvedParams?.eventId || '').trim()
  const metadata = await buildEventMetadata(eventId)
  
  // Override title for tickets page
  const title = typeof metadata.title === 'string' 
    ? metadata.title.replace(' | BlakVote', ' Tickets | BlakVote')
    : 'Event Tickets | BlakVote'
  
  return {
    ...metadata,
    title,
  }
}

export default function TicketsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
