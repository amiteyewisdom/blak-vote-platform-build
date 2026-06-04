import type { Metadata } from 'next'
import { buildEventMetadata } from '@/lib/event-metadata'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  console.log('[META] metadata.ts.generateMetadata called')
  console.log('[META] params:', params)
  console.log('[META] params.eventId:', params?.eventId)
  
  const eventId = String(params?.eventId || '').trim()
  console.log('[META] eventId normalized:', { eventId, length: eventId.length, isEmpty: eventId.length === 0 })
  
  const result = await buildEventMetadata(eventId)
  console.log('[META] buildEventMetadata returned:', { title: result.title, description: result.description })
  
  return result
}
