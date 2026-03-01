'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'

interface EventData {
  id: string
  title: string
  description: string
  vote_price: number
}

interface Candidate {
  id: string
  name: string
  bio: string
  photo_url: string
  voting_code: string
}

export default function PublicVotePage() {
  const params = useParams()
  const eventCode = params.event_code as string

  const [event, setEvent] = useState<EventData | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVotes, setSelectedVotes] = useState<{ [key: string]: number }>({})
  const { toast } = useToast()

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/events/public?code=${eventCode}`)
        const data = await res.json()

        if (!res.ok) {
          setLoading(false)
          return
        }

        setEvent(data.event)
        setCandidates(data.candidates)
      } catch (error) {
        console.error('Error loading event:', error)
      } finally {
        setLoading(false)
      }
    }

    if (eventCode) fetchEvent()
  }, [eventCode])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Loading event...
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Event not found
      </div>
    )
  }

  const handlePayment = async (candidateId: string) => {
    const votes = selectedVotes[candidateId] || 1
    const email = prompt('Enter your email for payment receipt')

    if (!email) return

    const amount = votes * event.vote_price

    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          nomineeId: candidateId,
          votes,
          email,
          amount,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Payment Error',
          description: data.error || 'Payment initialization failed',
          variant: 'destructive',
        })
        return
      }

      window.location.href = data.authorization_url
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-10">

        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold">{event.title}</h1>
          <p className="text-gray-400">{event.description}</p>
          <p className="text-yellow-500 font-semibold text-lg">
            Vote Price: GHS {event.vote_price}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {candidates.map((candidate) => {
            const votes = selectedVotes[candidate.id] || 1
            const total = votes * event.vote_price

            return (
              <div
                key={candidate.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4"
              >
                <h2 className="text-xl font-semibold">
                  {candidate.name}
                </h2>

                <p className="text-gray-400 text-sm">
                  {candidate.bio}
                </p>

                <div className="text-yellow-500 font-bold">
                  Code: {candidate.voting_code}
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-400">
                    Number of Votes
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={votes}
                    onChange={(e) =>
                      setSelectedVotes({
                        ...selectedVotes,
                        [candidate.id]: Number(e.target.value),
                      })
                    }
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>

                <div className="text-yellow-400 font-semibold">
                  Total: GHS {total}
                </div>

                <button
                  onClick={() => handlePayment(candidate.id)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F5C044] to-[#D9A92E] text-black font-bold hover:scale-105 transition"
                >
                  Pay & Vote
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}