'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface EventData {
  id: string
  title: string
  description: string
  vote_price?: number
  cost_per_vote?: number
}

interface Candidate {
  id: string
  name: string
  bio: string
  photo_url: string
  voting_code: string
}

interface BulkVotePackage {
  id: string
  votes_included: number
  price_per_package: number
  description: string | null
}

export default function PublicVotePage() {
  const params = useParams()
  const eventCode = params.event_code as string

  const [event, setEvent] = useState<EventData | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVotes, setSelectedVotes] = useState<{ [key: string]: number }>({})
  const [selectedAmounts, setSelectedAmounts] = useState<{ [key: string]: number }>({})
  const [selectedPackageIds, setSelectedPackageIds] = useState<{ [key: string]: string }>({})
  const [bulkPackages, setBulkPackages] = useState<BulkVotePackage[]>([])
  const [receiptEmail, setReceiptEmail] = useState('')
  const [submittingCandidateId, setSubmittingCandidateId] = useState<string | null>(null)
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null)
  const { toast } = useToast()
  const votePrice = resolveEventVotePrice(event)

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

        if (data?.event?.id) {
          const pkgRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(data.event.id)}`)
          if (pkgRes.ok) {
            const pkgPayload = await pkgRes.json()
            setBulkPackages(pkgPayload.packages || [])
          }
        }
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
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--legacy-bg-base))] px-4">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
          <p className="text-sm text-foreground/60">Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--legacy-bg-base))] px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-foreground">Event not found</h1>
          <p className="mt-2 text-foreground/60">The voting link may be invalid or no longer available.</p>
        </div>
      </div>
    )
  }

  const handlePayment = async (candidateId: string, override?: { votes: number; amount: number; bulkPackageId: string | null }) => {
    const votes = override?.votes ?? selectedVotes[candidateId] ?? 1
    const amount = Number(override?.amount ?? selectedAmounts[candidateId] ?? votes * votePrice)
    const bulkPackageId = override?.bulkPackageId ?? selectedPackageIds[candidateId] ?? null

    if (!receiptEmail.trim()) {
      toast({
        title: 'Receipt email required',
        description: 'Enter an email address before continuing to payment.',
        variant: 'destructive',
      })
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a valid payment amount for the selected vote quantity.',
        variant: 'destructive',
      })
      return
    }

    setSubmittingCandidateId(candidateId)

    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          candidateId,
          quantity: votes,
          amount,
          bulkPackageId,
          email: receiptEmail.trim(),
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

      const PAYSTACK_CHECKOUT_DOMAIN = 'checkout.paystack.com'
      try {
        const url = new URL(data.authorization_url)
        if (url.hostname !== PAYSTACK_CHECKOUT_DOMAIN) {
          throw new Error('Invalid payment redirect domain')
        }
        if (!url.protocol.startsWith('https')) {
          throw new Error('Payment URL must use HTTPS')
        }
        window.location.href = data.authorization_url
      } catch (urlError) {
        console.error('Invalid payment URL:', data.authorization_url, urlError)
        toast({
          title: 'Security Error',
          description: 'Received invalid payment URL from server',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setSubmittingCandidateId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--legacy-bg-base))] px-4 sm:px-6 lg:px-8 py-14 sm:py-16 text-foreground">
      <div className="mx-auto max-w-6xl">
        {/* Header Section */}
        <div className="max-w-3xl mb-10">
          <p className="text-xs sm:text-sm uppercase tracking-[0.12em] text-foreground/55 font-medium">Public voting</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] mt-2">{event.title}</h1>
          <p className="mt-3 text-sm sm:text-base text-foreground/60 leading-relaxed max-w-2xl">
            {event.description}
          </p>
        </div>

        {/* Voting Details Card */}
        <div className="mb-10 rounded-md border border-border/60 bg-foreground/[0.02] p-5 sm:p-6 max-w-lg">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium">Price per vote</p>
              <p className="mt-2 text-xl sm:text-2xl font-semibold tabular-nums">GHS {votePrice.toFixed(2)}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium block">Receipt email</label>
              <input
                type="email"
                value={receiptEmail}
                onChange={(e) => setReceiptEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full h-9 px-3 rounded-md bg-transparent border border-border/60 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground/35 text-sm transition-colors"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-foreground/50">Payment confirmation and receipts will be sent to this email address.</p>
        </div>

        {/* Candidates List */}
        <div className="space-y-0 border divide-y divide-border/50 border-border/50 rounded-md overflow-hidden">
          {candidates.map((candidate) => {
            const isExpanded = expandedCandidateId === candidate.id
            const votes = selectedVotes[candidate.id] || 1
            const baseTotal = Number((votes * votePrice).toFixed(2))
            const total = Number((selectedAmounts[candidate.id] ?? baseTotal).toFixed(2))
            const savings = Math.max(0, Number((baseTotal - total).toFixed(2)))
            const unitPrice = Number((total / votes).toFixed(4))

            return (
              <div key={candidate.id} className="bg-background/40 hover:bg-foreground/[0.03] transition-colors">
                {/* Row Header */}
                <button
                  className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4 group text-left"
                  onClick={() => setExpandedCandidateId(isExpanded ? null : candidate.id)}
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {candidate.photo_url ? (
                      <img
                        src={candidate.photo_url}
                        alt={candidate.name}
                        className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-foreground/10 text-sm font-bold text-foreground flex-shrink-0">
                        {candidate.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[15px] sm:text-base font-semibold leading-tight tracking-[-0.01em] truncate">
                        {candidate.name}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-foreground/55 truncate">
                        Code: {candidate.voting_code}
                      </p>
                    </div>
                  </div>

                  <button
                    className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium border border-border/70 text-foreground/80 hover:border-foreground/30 hover:text-foreground hover:bg-foreground/[0.035] transition-colors flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePayment(candidate.id, {
                        votes,
                        amount: total,
                        bulkPackageId: null,
                      })
                    }}
                    disabled={submittingCandidateId === candidate.id}
                  >
                    {submittingCandidateId === candidate.id ? 'Processing...' : 'Vote'}
                  </button>

                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0 text-foreground/50">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 sm:px-6 py-5 sm:py-6 bg-foreground/[0.02] space-y-5">
                    {/* Biography */}
                    {candidate.bio && (
                      <div>
                        <p className="text-[13px] sm:text-sm text-foreground/70 leading-relaxed">
                          {candidate.bio}
                        </p>
                      </div>
                    )}

                    {/* Vote Selection */}
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label className="text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium block">
                          Number of votes
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={votes}
                          onChange={(e) => {
                            const nextVotes = Math.max(1, Number(e.target.value) || 1)
                            setSelectedVotes({
                              ...selectedVotes,
                              [candidate.id]: nextVotes,
                            })
                            setSelectedAmounts({
                              ...selectedAmounts,
                              [candidate.id]: Number((nextVotes * votePrice).toFixed(2)),
                            })
                            setSelectedPackageIds({
                              ...selectedPackageIds,
                              [candidate.id]: '',
                            })
                          }}
                          className="mt-2 w-full h-9 px-3 rounded-md bg-transparent border border-border/60 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground/35 text-sm transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium block">
                          Amount to pay
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={total}
                          onChange={(e) => {
                            const nextAmount = Number(e.target.value)
                            setSelectedAmounts({
                              ...selectedAmounts,
                              [candidate.id]: Number.isFinite(nextAmount) ? nextAmount : 0,
                            })
                          }}
                          className="mt-2 w-full h-9 px-3 rounded-md bg-transparent border border-border/60 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground/35 text-sm transition-colors"
                        />
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="rounded-md border border-border/60 bg-foreground/[0.02] p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Purchasing:</span>
                        <span className="font-semibold">{votes} votes</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Effective price:</span>
                        <span className="font-semibold">GHS {unitPrice.toFixed(4)}</span>
                      </div>
                      {savings > 0 && (
                        <div className="flex justify-between text-emerald-500">
                          <span>You save:</span>
                          <span className="font-semibold">GHS {savings.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
                        <span>Total:</span>
                        <span>GHS {total.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Bulk Packages */}
                    {bulkPackages.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium">Bulk packages</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {bulkPackages.map((pkg) => {
                            const packageVotes = Number(pkg.votes_included)
                            const packagePrice = Number(pkg.price_per_package)
                            const retail = Number((packageVotes * votePrice).toFixed(2))
                            const packageSavings = Math.max(0, Number((retail - packagePrice).toFixed(2)))

                            return (
                              <button
                                key={pkg.id}
                                type="button"
                                onClick={() =>
                                  handlePayment(candidate.id, {
                                    votes: packageVotes,
                                    amount: packagePrice,
                                    bulkPackageId: pkg.id,
                                  })
                                }
                                disabled={submittingCandidateId === candidate.id}
                                className="rounded-md border border-border/60 bg-foreground/[0.02] p-3 text-left hover:border-foreground/30 hover:bg-foreground/[0.05] transition-colors disabled:opacity-60"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold">{packageVotes} votes</p>
                                    <p className="text-xs text-foreground/60">GHS {packagePrice.toFixed(2)}</p>
                                  </div>
                                  {packageSavings > 0 && (
                                    <span className="text-xs font-semibold text-emerald-500 flex-shrink-0">
                                      Save GHS {packageSavings.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
