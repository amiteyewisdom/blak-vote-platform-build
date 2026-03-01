'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Clock, FileText } from 'lucide-react'

interface VotingEvent {
  id: string
  title: string
  description: string
  status: string
  startDate: string
  endDate: string
  hasVoted?: boolean
}

export default function VoterDashboard() {
  const [availableVotes, setAvailableVotes] = useState<VotingEvent[]>([])
  const [completedVotes, setCompletedVotes] = useState<VotingEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchVotes = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.user) return

        // Get active voting events
        const { data: activeEvents, error: activeError } = await supabase
          .from('voting_events')
          .select('*')
          .eq('status', 'active')
          .order('start_date', { ascending: false })

        // Get user's votes
        const { data: userVotes, error: votesError } = await supabase
          .from('votes')
          .select('voting_event_id')
          .eq('voter_id', session.user.id)

        if (!activeError && activeEvents) {
          const votedEventIds = new Set(userVotes?.map((v) => v.voting_event_id))

          const available = activeEvents.filter(
            (event) => !votedEventIds.has(event.id)
          )
          const completed = activeEvents.filter((event) =>
            votedEventIds.has(event.id)
          )

          setAvailableVotes(available)
          setCompletedVotes(completed)
        }
      } catch (error) {
        console.error('Error fetching votes:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchVotes()
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const stats = [
    {
      label: 'Available Votes',
      value: availableVotes.length,
      icon: Clock,
    },
    {
      label: 'Votes Cast',
      value: completedVotes.length,
      icon: CheckCircle,
    },
  ]

  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">My Votes</h1>
        <p className="text-muted-foreground">
          View available voting events and cast your votes securely.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Available Votes */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Available Votes</h2>
        {availableVotes.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No available votes
              </h3>
              <p className="text-muted-foreground">
                Check back soon for new voting events.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {availableVotes.map((event) => (
              <Card key={event.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                  <CardDescription>{event.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      <p>Ends: {new Date(event.endDate).toLocaleDateString()}</p>
                    </div>
                    <Button className="w-full" asChild>
                      <Link href={`/voter/votes/${event.id}`}>
                        Cast Your Vote
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Votes */}
      {completedVotes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Your Votes</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {completedVotes.map((event) => (
              <Card key={event.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{event.title}</CardTitle>
                      <CardDescription>{event.description}</CardDescription>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      You have already voted in this event.
                    </p>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={`/voter/votes/${event.id}/results`}>
                        View Results
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
