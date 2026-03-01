'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { LoadingSpinner } from '@/components/loading-spinner'

interface VotingResult {
  candidateName: string
  voteCount: number
  percentage: number
}

interface EventWithResults {
  id: string
  title: string
  status: string
  totalVotes: number
  results: VotingResult[]
}

const COLORS = ['#3B82F6', '#F97316', '#10B981', '#F43F5E', '#8B5CF6', '#14B8A6']

export default function ResultsPage() {
  const [events, setEvents] = useState<EventWithResults[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const {
          data: { user: sessionUser },
        } = await supabase.auth.getUser()

        if (!sessionUser) {
          window.location.href = '/auth/sign-in'
          return
        }

        setUser(sessionUser)

        // Fetch organizer's events with results
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select(`
            id,
            title,
            status,
            candidates(
              id,
              name,
              votes(id)
            )
          `)
          .eq('organizer_id', sessionUser.id)

        if (eventsError) throw eventsError

        const processedEvents = eventsData.map((event: any) => {
          const totalVotes = event.candidates.reduce(
            (sum: number, candidate: any) => sum + candidate.votes.length,
            0
          )

          const results = event.candidates.map((candidate: any) => ({
            candidateName: candidate.name,
            voteCount: candidate.votes.length,
            percentage: totalVotes > 0 ? ((candidate.votes.length / totalVotes) * 100).toFixed(1) : 0,
          }))

          return {
            id: event.id,
            title: event.title,
            status: event.status,
            totalVotes,
            results,
          }
        })

        setEvents(processedEvents)
      } catch (error) {
        console.error('Error fetching results:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return <LoadingSpinner />
  }

  if (events.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8 text-foreground">Election Results</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No events created yet. Create an event to see voting results here.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-foreground">Election Results</h1>

      <div className="space-y-8">
        {events.map((event) => (
          <Card key={event.id} className="overflow-hidden">
            <CardHeader className="bg-secondary">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{event.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Status: <span className="capitalize font-semibold">{event.status}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Votes</p>
                  <p className="text-3xl font-bold text-primary">{event.totalVotes}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {event.totalVotes === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No votes recorded yet for this event.
                </p>
              ) : (
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Bar Chart */}
                  <div className="flex justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={event.results}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="candidateName" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="voteCount" fill="#3B82F6" name="Votes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pie Chart */}
                  <div className="flex justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={event.results}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ candidateName, percentage }) =>
                            `${candidateName}: ${percentage}%`
                          }
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="voteCount"
                        >
                          {event.results.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value} votes`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="mt-8">
                <h3 className="font-semibold mb-4 text-foreground">Detailed Results</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="text-left py-2 text-muted-foreground">Candidate</th>
                        <th className="text-center py-2 text-muted-foreground">Votes</th>
                        <th className="text-center py-2 text-muted-foreground">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.results
                        .sort((a, b) => b.voteCount - a.voteCount)
                        .map((result, index) => (
                          <tr key={index} className="border-b border-border hover:bg-secondary">
                            <td className="py-3 text-foreground">{result.candidateName}</td>
                            <td className="py-3 text-center font-semibold text-primary">
                              {result.voteCount}
                            </td>
                            <td className="py-3 text-center">{result.percentage}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
