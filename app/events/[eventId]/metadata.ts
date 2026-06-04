import type { Metadata } from 'next'
import { buildEventMetadata } from '@/lib/event-metadata'

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  console.log('[META] metadata.ts.generateMetadata params:', params)
  return await buildEventMetadata(params.eventId)
}
