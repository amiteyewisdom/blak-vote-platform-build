'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock } from 'lucide-react'

interface VotingEvent {
  id: string
  title: string
  description: string
  status: string
  startDate: string
  endDate: string
}

export default function VotesPage() {
  const [activeEvents, setActiveEvents] = useState<VotingEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActiveEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('voting_events')
          .select('*')
          .eq('status', 'active')
          .order('start_date', { ascending: false })

        if (!error && data) {
          setActiveEvents(data)
        }
      } catch (error) {
        console.error('Error fetching events:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchActiveEvents()
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Available Voting Events</h1>
        <p className="text-muted-foreground">
          All active voting events you can participate in
        </p>
      </div>

      {activeEvents.length === 0 ? (
        <Card>
          <CardContent className="pt-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No active voting events
            </h3>
            <p className="text-muted-foreground">
              Check back soon for new voting opportunities.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeEvents.map((event) => (
            <Card key={event.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{event.title}</CardTitle>
                <CardDescription>{event.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p>Started: {new Date(event.startDate).toLocaleDateString()}</p>
                  <p>Ends: {new Date(event.endDate).toLocaleDateString()}</p>
                </div>
                <Button className="w-full" asChild>
                  <Link href={`/voter/votes/${event.id}`}>
                    Cast Your Vote
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
