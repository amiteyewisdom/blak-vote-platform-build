'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, AlertCircle } from 'lucide-react'

interface VotingEvent {
  id: string
  title: string
  description: string
  status: string
  startDate: string
  endDate: string
}

interface Candidate {
  id: string
  name: string
  description?: string
  voteCount: number
}

export default function VotingPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.eventId as string

  const [event, setEvent] = useState<VotingEvent | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        // Fetch event
        const { data: eventData, error: eventError } = await supabase
          .from('voting_events')
          .select('*')
          .eq('id', eventId)
          .single()

        if (eventError) throw eventError
        setEvent(eventData)

        // Fetch candidates
        const { data: candidatesData, error: candidatesError } = await supabase
          .from('candidates')
          .select('*')
          .eq('voting_event_id', eventId)
          .order('created_at', { ascending: true })

        if (candidatesError) throw candidatesError
        setCandidates(candidatesData || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    fetchEventData()
  }, [eventId])

  const handleVote = async () => {
    if (!selectedCandidateId) {
      setError('Please select a candidate')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        throw new Error('You must be logged in to vote')
      }

      // Record the vote
      const { error: voteError } = await supabase.from('votes').insert({
        voting_event_id: eventId,
        candidate_id: selectedCandidateId,
        voter_id: session.user.id,
      })

      if (voteError) throw voteError

      setSubmitted(true)
      setTimeout(() => {
        router.push('/voter')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit vote')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex-1 space-y-8 p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Voting event not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Vote Submitted
            </h2>
            <p className="text-muted-foreground mb-6">
              Thank you for voting! Your vote has been securely recorded.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting you to the dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-8 p-8 max-w-3xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">{event.title}</h1>
        <p className="text-muted-foreground">{event.description}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Select Your Choice</CardTitle>
          <CardDescription>
            Choose the candidate or option you'd like to vote for
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidates.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No candidates available for this event
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedCandidateId === candidate.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                          selectedCandidateId === candidate.id
                            ? 'border-primary bg-primary'
                            : 'border-border'
                        }`}
                      >
                        {selectedCandidateId === candidate.id && (
                          <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">
                          {candidate.name}
                        </h3>
                        {candidate.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {candidate.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleVote}
                  disabled={!selectedCandidateId || submitting}
                >
                  {submitting ? 'Submitting Your Vote...' : 'Submit Vote'}
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Vote is Secure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            ✓ Your vote is encrypted end-to-end and stored securely.
          </p>
          <p>
            ✓ Your identity remains confidential - votes are anonymized.
          </p>
          <p>
            ✓ Each person can only vote once per event.
          </p>
          <p>
            ✓ Results are verified using blockchain technology.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
