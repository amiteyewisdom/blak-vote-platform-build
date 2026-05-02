'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { isVotingOpenStatus } from '@/lib/event-status'
import { Vote, Users, Trophy, Heart, Calendar, Clock, Sparkles, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface BulkVotePackage {
  id: string
  votes_included: number
  price_per_package: number
  description?: string | null
}

export default function EventPage() {
  const params = useParams()
  const eventCode = params?.eventId as string

  const [event, setEvent] = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([])
  const [voting, setVoting] = useState(false)
  const [showNominateForm, setShowNominateForm] = useState(false)
  const [nomineeName, setNomineeName] = useState('')
  const [nomineeEmail, setNomineeEmail] = useState('')
  const [nomineePhone, setNomineePhone] = useState('')
  const [nomineeBio, setNomineeBio] = useState('')
  const [nomineeCategoryId, setNomineeCategoryId] = useState('')
  const [nomineeImageFile, setNomineeImageFile] = useState<File | null>(null)
  const [nomineeImagePreview, setNomineeImagePreview] = useState<string | null>(null)
  const [submittingNomination, setSubmittingNomination] = useState(false)
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [voteEmail, setVoteEmail] = useState('')
  const [votePhone, setVotePhone] = useState('')
  const [voteModalError, setVoteModalError] = useState('')
  const [bulkPackages, setBulkPackages] = useState<BulkVotePackage[]>([])
  const [selectedVoteQuantity, setSelectedVoteQuantity] = useState(1)
  const [selectedBulkPackageId, setSelectedBulkPackageId] = useState<string | null>(null)
  const [selectedVoteAmount, setSelectedVoteAmount] = useState<number | null>(null)
  const [customVoteQuantity, setCustomVoteQuantity] = useState<string>('1')
  const { toast } = useToast()

  const votePrice = resolveEventVotePrice(event)
  const votingOpen = isVotingOpenStatus(event?.status)
  const parsedCustomVoteQuantity = Number.parseInt(customVoteQuantity, 10)
  const isValidCustomVoteQuantity =
    Number.isFinite(parsedCustomVoteQuantity) && parsedCustomVoteQuantity >= 1 && parsedCustomVoteQuantity <= 1000
  const effectiveCustomVoteQuantity = isValidCustomVoteQuantity ? parsedCustomVoteQuantity : 1

  useEffect(() => {
    if (eventCode) {
      fetchEventData()
    }
  }, [eventCode])

  const fetchEventData = async () => {
    try {
      const res = await fetch(`/api/events/public?code=${eventCode}`)
      const data = await res.json()

      if (!res.ok || !data.event) {
        setLoading(false)
        return
      }

      setEvent(data.event)

      if (data?.event?.id) {
        try {
          const pkgRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(data.event.id)}`)
          if (pkgRes.ok) {
            const pkgPayload = await pkgRes.json()
            setBulkPackages((pkgPayload.packages || []) as BulkVotePackage[])
          }
        } catch (pkgError) {
          console.warn('Unable to load bulk packages', pkgError)
        }
      }

      if (data.categories) {
        setCategories(data.categories)
      }

      if (data.candidates) {
        setCandidates(
          data.candidates.map((c: any) => ({
            id: c.id,
            nominee_name: c.nominee_name || c.name,
            bio: c.bio,
            photo_url: c.photo_url || null,
            vote_count: c.vote_count || 0,
            category_id: c.category_id || null,
          }))
        )
      }
    } catch (err) {
      console.error('Error fetching event:', err)
    }

    setLoading(false)
  }

  const handleVote = async (options?: {
    quantity?: number
    bulkPackageId?: string | null
    amount?: number | null
  }) => {
    if (!selectedCandidate || !votingOpen) return
    const requestedQuantity = options?.quantity ?? 1
    if (requestedQuantity > 1000) {
      toast({
        title: 'Vote limit exceeded',
        description: 'You can purchase a maximum of 1000 votes per transaction.',
        variant: 'destructive',
      })
      return
    }
    setSelectedVoteQuantity(options?.quantity ?? 1)
    setSelectedBulkPackageId(options?.bulkPackageId ?? null)
    setSelectedVoteAmount(options?.amount ?? null)
    setVoteModalError('')
    // Show vote modal instead of using deprecated prompt()
    setShowVoteModal(true)
  }

  const handleVoteSubmit = async () => {
    // =========================================================================
    // CRITICAL FIX #4: Phone/Email collection with validation
    // HIGH FIX #1: Email validation on frontend
    // =========================================================================
    
    // Validate email
    if (!voteEmail.trim()) {
      setVoteModalError('Email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(voteEmail.trim())) {
      setVoteModalError('Please enter a valid email address')
      return
    }

    // Validate phone if provided
    if (votePhone.trim()) {
      const phoneRegex = /^\+?[1-9]\d{6,14}$/
      if (!phoneRegex.test(votePhone.trim())) {
        setVoteModalError('Please enter a valid phone number (e.g., +233501234567)')
        return
      }
    }

    setVoting(true)
    try {
      const paymentPayload = {
        eventId: event.id,
        candidateId: selectedCandidate,
        quantity: selectedVoteQuantity,
        bulkPackageId: selectedBulkPackageId || undefined,
        amount: selectedVoteAmount ?? undefined,
        email: voteEmail.trim(),
        phone: votePhone.trim() || undefined,
      }

      let res = await fetch('/api/payment-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload),
      })

      if (res.status === 404) {
        res = await fetch('/api/payments/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload),
        })
      }

      if (res.status === 404) {
        res = await fetch('/api/payments/create-checkout/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload),
        })
      }

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Payment Error',
          description: data.error || 'Payment initialization failed',
          variant: 'destructive',
        })
        setVoting(false)
        return
      }

      // =========================================================================
      // CRITICAL FIX #2: URL validation on redirect
      // Prevents phishing/injection attacks
      // =========================================================================
      const PAYSTACK_CHECKOUT_DOMAIN = 'checkout.paystack.com'

      try {
        const url = new URL(data.authorization_url)
        
        if (url.hostname !== PAYSTACK_CHECKOUT_DOMAIN) {
          throw new Error('Invalid payment redirect domain')
        }
        
        if (!url.protocol.startsWith('https')) {
          throw new Error('Payment URL must use HTTPS')
        }
        
        setShowVoteModal(false)
        window.location.href = data.authorization_url
      } catch (urlError) {
        console.error('Invalid payment URL:', data.authorization_url, urlError)
        toast({
          title: 'Security Error',
          description: 'Received invalid payment URL from server. Please try again.',
          variant: 'destructive',
        })
        setVoting(false)
      }
    } catch (error) {
      console.error('Voting error:', error)
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
      setVoting(false)
    }
  }

  const groupedCandidates = categories.map((category) => ({
    id: category.id,
    name: category.name,
    candidates: candidates
      .filter((candidate) => candidate.category_id === category.id)
      .sort((a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0)),
  }))

  const uncategorizedCandidates = candidates
    .filter((candidate) => !candidate.category_id)
    .sort((a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0))

  const visibleCandidateGroups = [
    ...groupedCandidates,
    ...(uncategorizedCandidates.length > 0
      ? [{ id: 'uncategorized', name: 'Uncategorized', candidates: uncategorizedCandidates }]
      : []),
  ].filter((group) => group.candidates.length > 0)

  useEffect(() => {
    if (visibleCandidateGroups.length === 0) return
    setExpandedGroupIds((prev) => {
      if (prev.length > 0) return prev
      return [String(visibleCandidateGroups[0].id)]
    })
  }, [visibleCandidateGroups.length])

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    )
  }

  const handleNominate = () => {
    setShowNominateForm(true)
  }

  const handleNominationSubmit = async () => {
    if (!event?.id || !nomineeName.trim()) return

    if (categories.length > 0 && !nomineeCategoryId) {
      toast({
        title: 'Category required',
        description: 'Please choose one of the organizer categories.',
        variant: 'destructive',
      })
      return
    }

    setSubmittingNomination(true)

    try {
      const formData = new FormData()
      formData.append('eventId', event.id)
      formData.append('nomineeName', nomineeName)
      formData.append('nomineeEmail', nomineeEmail)
      formData.append('nomineePhone', nomineePhone)
      formData.append('bio', nomineeBio)
      formData.append('categoryId', nomineeCategoryId)
      if (nomineeImageFile) {
        formData.append('image', nomineeImageFile)
      }

      const res = await fetch('/api/nominations', {
        method: 'POST',
        body: formData,
      })

      const payload = await res.json()

      if (!res.ok) {
        const detailParts = [payload?.error, payload?.details, payload?.hint, payload?.code]
          .filter(Boolean)
          .map((part: unknown) => String(part))
        toast({
          title: 'Nomination failed',
          description: detailParts.join(' | ') || 'Unable to submit nomination',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Nomination submitted',
        description: 'Organizer will review and approve or decline this nomination.',
      })

      setNomineeName('')
      setNomineeEmail('')
      setNomineePhone('')
      setNomineeBio('')
      setNomineeCategoryId('')
      setNomineeImageFile(null)
      setNomineeImagePreview(null)
      setShowNominateForm(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Unable to submit nomination', variant: 'destructive' })
    } finally {
      setSubmittingNomination(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[hsl(var(--gold))]/30 border-t-[hsl(var(--gold))] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading event details...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-[hsl(var(--gold))]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-[hsl(var(--gold))]" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Event Not Found</h2>
          <p className="text-muted-foreground mb-6">This event may not be active or doesn't exist.</p>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[hsl(var(--gold))] text-black font-semibold rounded-2xl hover:opacity-90 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] text-foreground">
      {/* Enhanced Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--legacy-bg-card))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))]">
          <div className="absolute w-[600px] h-[600px] bg-[hsl(var(--gold))]/5 blur-[180px] rounded-full top-[-200px] left-[-200px] animate-pulse"></div>
          <div className="absolute w-[400px] h-[400px] bg-[hsl(var(--gold))]/8 blur-[150px] rounded-full bottom-[-100px] right-[-100px] animate-pulse delay-1000"></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--gold))]/10 border border-[hsl(var(--gold))]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[hsl(var(--gold))]" />
              <span className="text-[hsl(var(--gold))] text-sm font-medium">{votingOpen ? 'Voting Open' : 'Published Event'}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-white to-[hsl(var(--gold))] bg-clip-text text-transparent">
              {event.title}
            </h1>
            <p className="text-lg sm:text-xl text-foreground/70 max-w-3xl mx-auto leading-relaxed">
              {event.description}
            </p>
          </div>

          {/* Event Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
            <div className="text-center p-4 bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm rounded-2xl border border-border/70">
              <Users className="w-6 h-6 text-[hsl(var(--gold))] mx-auto mb-2" />
              <div className="text-2xl font-bold text-[hsl(var(--gold))]">{candidates.length}</div>
              <div className="text-xs text-muted-foreground">Candidates</div>
            </div>

            <div className="text-center p-4 bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm rounded-2xl border border-border/70">
              <div className="w-6 h-6 text-[hsl(var(--gold))] mx-auto mb-2 flex items-center justify-center font-bold">₵</div>
              <div className="text-2xl font-bold text-[hsl(var(--gold))]">₵{Number(votePrice || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Per Vote</div>
            </div>

            <div className="text-center p-4 bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm rounded-2xl border border-border/70">
              <Clock className="w-6 h-6 text-[hsl(var(--gold))] mx-auto mb-2" />
              <div className="text-lg font-bold text-[hsl(var(--gold))]">
                {votingOpen ? 'Open' : 'Closed'}
              </div>
              <div className="text-xs text-muted-foreground">Status</div>
            </div>

            <div className="text-center p-4 bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm rounded-2xl border border-border/70">
              <Calendar className="w-6 h-6 text-[hsl(var(--gold))] mx-auto mb-2" />
              <div className="text-sm font-bold text-[hsl(var(--gold))]">
                {new Date(event.end_date).toLocaleDateString()}
              </div>
              <div className="text-xs text-muted-foreground">Ends</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Candidates List */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-border/70">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Vote for Your Favorite</h2>
                <p className="text-muted-foreground text-sm mt-2">Select a candidate below to cast your vote</p>
              </div>
              <button
                onClick={handleNominate}
                className="px-4 py-2.5 bg-[hsl(var(--gold))]/15 hover:bg-[hsl(var(--gold))]/25 text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/30 hover:border-[hsl(var(--gold))]/50 rounded-xl transition-all duration-200 flex items-center gap-2 font-medium text-sm whitespace-nowrap"
              >
                <Heart className="w-4 h-4" />
                Nominate
              </button>
            </div>

            {candidates.length === 0 ? (
              <div className="text-center py-12 bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm rounded-3xl border border-border/70">
                <Trophy className="w-12 h-12 text-[hsl(var(--gold))] mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Candidates Yet</h3>
                <p className="text-muted-foreground">Candidates will be announced soon! Be the first to nominate someone.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {visibleCandidateGroups.map((group) => (
                  <div key={group.id} className="space-y-4">
                    <button
                      type="button"
                      onClick={() => toggleGroup(String(group.id))}
                      className="w-full flex items-center justify-between mb-4 pb-4 border-b border-border text-left"
                    >
                      <h3 className="text-lg font-bold text-[hsl(var(--gold))] flex items-center gap-3">
                        {expandedGroupIds.includes(String(group.id)) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {event?.image_url ? (
                          <img
                            src={event.image_url}
                            alt={event.title || 'Event'}
                            className="h-8 w-8 rounded-md object-cover border border-border"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-md bg-surface/70 border border-border" />
                        )}
                        <span>{group.name}</span>
                      </h3>
                      <span className="text-xs font-medium text-muted-foreground bg-surface/70 px-3 py-1 rounded-full">
                        {group.candidates.length} candidates
                      </span>
                    </button>

                    {expandedGroupIds.includes(String(group.id)) && (
                      <div className="space-y-3">
                        {group.candidates.map((candidate, index) => (
                        <div
                          key={candidate.id}
                          className={`bg-[hsl(var(--legacy-bg-card))]/60 backdrop-blur-sm border rounded-xl p-4 sm:p-5 cursor-pointer transition-all duration-200 group/card ${
                            selectedCandidate === candidate.id
                              ? 'border-[hsl(var(--gold))]/70 bg-[hsl(var(--gold))]/8 shadow-lg shadow-[hsl(var(--gold))]/15 scale-[1.01]'
                              : 'border-white/8 hover:border-[hsl(var(--gold))]/40 hover:bg-[hsl(var(--gold))]/5'
                          }`}
                          onClick={() => setSelectedCandidate(candidate.id)}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                              <div className="w-14 h-14 rounded-lg overflow-hidden bg-[hsl(var(--legacy-bg-input))] border border-border shadow-md flex-shrink-0">
                                {candidate.photo_url ? (
                                  <img
                                    src={candidate.photo_url}
                                    alt={candidate.nominee_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-[hsl(var(--gold))]/90 to-[hsl(var(--gold-deep))] flex items-center justify-center text-black font-bold text-xl">
                                    {candidate.nominee_name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pt-1">
                                <h3 className="font-bold text-base text-foreground group-hover/card:text-[hsl(var(--gold))] transition-colors truncate">{candidate.nominee_name}</h3>
                                {candidate.bio && (
                                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-1 mt-1">{candidate.bio}</p>
                                )}
                              </div>
                            </div>

                            <div className="px-3 py-2 bg-[hsl(var(--gold))]/12 border border-[hsl(var(--gold))]/25 rounded-lg flex flex-col items-center justify-center min-w-fit flex-shrink-0">
                              <div className="font-bold text-lg text-[hsl(var(--gold))]">
                                {candidate.vote_count || 0}
                              </div>
                              <div className="text-muted-foreground text-[11px] font-medium mt-0.5">
                                vote{(candidate.vote_count || 0) !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Voting Panel */}
          <div className="lg:col-span-1">
            <div className="bg-[hsl(var(--legacy-bg-card))]/80 backdrop-blur-sm border border-border/70 rounded-3xl p-6 sticky top-6">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Vote className="w-5 h-5 text-[hsl(var(--gold))]" />
                Cast Your Vote
              </h3>

              {selectedCandidate ? (
                <div className="space-y-4">
                  {!votingOpen && (
                    <div className="p-4 bg-surface/70 rounded-2xl border border-border text-sm text-foreground/70">
                      Voting is currently closed for this event. You can view nominees and results, but votes are disabled until the organizer opens voting.
                    </div>
                  )}

                  <div className="p-4 bg-[hsl(var(--gold))]/10 border border-[hsl(var(--gold))]/20 rounded-2xl">
                    <div className="text-sm text-muted-foreground mb-1">Selected Candidate</div>
                    <div className="font-semibold text-foreground text-lg">
                      {candidates.find(c => c.id === selectedCandidate)?.nominee_name}
                    </div>
                  </div>

                  <div className="p-4 bg-surface/70 rounded-2xl border border-border">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cost per vote:</span>
                      <span className="text-[hsl(var(--gold))] font-semibold">GHS {votePrice}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 bg-[hsl(var(--gold))]/8 border border-[hsl(var(--gold))]/25 rounded-2xl">
                      <label className="block text-sm text-foreground/70 mb-3">Number of Votes to Purchase</label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={customVoteQuantity}
                        onChange={(e) => setCustomVoteQuantity(e.target.value || '1')}
                        className="w-full bg-[hsl(var(--legacy-bg-input))] border border-[hsl(var(--gold))]/40 rounded-xl px-4 py-3 text-foreground placeholder-white/40 focus:border-[hsl(var(--gold))] focus:outline-none transition text-lg font-semibold"
                        placeholder="1"
                      />
                      {!isValidCustomVoteQuantity && customVoteQuantity.trim().length > 0 && (
                        <p className="mt-2 text-xs text-red-400">Enter a value between 1 and 1000.</p>
                      )}
                      <div className="mt-3 p-3 bg-surface/70 rounded-lg border border-border/50">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total Cost:</span>
                          <span className="text-[hsl(var(--gold))] font-bold text-lg">GHS {Number((effectiveCustomVoteQuantity * votePrice)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleVote({ quantity: effectiveCustomVoteQuantity, bulkPackageId: null, amount: null })}
                      disabled={voting || !votingOpen || !isValidCustomVoteQuantity}
                      className="w-full py-4 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-black font-semibold hover:brightness-110 hover:shadow-[0_4px_24px_hsl(var(--gold)/0.35)] active:scale-[0.97] transition-all duration-200 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--legacy-bg-base))] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {voting ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                          Processing...
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Vote className="w-4 h-4" />
                          {votingOpen ? 'Continue to Payment' : 'Voting Closed'}
                        </div>
                      )}
                    </button>
                  </div>

                  {bulkPackages.length > 0 && (
                    <div className="p-4 bg-[hsl(var(--gold))]/8 border border-[hsl(var(--gold))]/25 rounded-2xl space-y-3">
                      <p className="text-sm font-semibold text-[hsl(var(--gold))]">Bulk Vote Packages</p>
                      <div className="space-y-2">
                        {bulkPackages.map((pkg) => {
                          const qty = Number(pkg.votes_included)
                          const amount = Number(pkg.price_per_package)
                          const retail = Number((qty * votePrice).toFixed(2))
                          const savings = Math.max(0, Number((retail - amount).toFixed(2)))

                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() =>
                                handleVote({
                                  quantity: qty,
                                  bulkPackageId: pkg.id,
                                  amount,
                                })
                              }
                              disabled={voting || !votingOpen}
                              className="w-full text-left p-3 rounded-xl border border-[hsl(var(--gold))]/30 bg-surface/70 hover:bg-surface transition disabled:opacity-50"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{qty} votes for GHS {amount.toFixed(2)}</p>
                                  <p className="text-xs text-muted-foreground">{pkg.description || 'Organizer bulk package'}</p>
                                </div>
                                {savings > 0 && (
                                  <span className="text-xs text-emerald-400 border border-emerald-400/40 px-2 py-1 rounded-full">
                                    Save GHS {savings.toFixed(2)}
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
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Vote className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                  <p>Select a candidate to vote</p>
                  {bulkPackages.length > 0 && (
                    <p className="mt-2 text-xs text-[hsl(var(--gold))]">Bulk vote packages will appear after candidate selection.</p>
                  )}
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border">
                <div className="text-center">
                  <p className="text-muted-foreground text-sm mb-3">Explore this event</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {event?.public_results_enabled !== false ? (
                      <Link
                        href={`/events/${eventCode}/results`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-surface/70 hover:bg-surface/80 border border-border rounded-xl transition-all duration-200 text-sm"
                      >
                        📊 View Results
                      </Link>
                    ) : null}
                    <Link
                      href={`/events/${eventCode}/nominees`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-surface/70 hover:bg-surface/80 border border-border rounded-xl transition-all duration-200 text-sm"
                    >
                      🗂 View Categories
                    </Link>
                    <Link
                      href={`/events/${eventCode}/tickets`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--gold))]/20 hover:bg-[hsl(var(--gold))]/30 border border-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] rounded-xl transition-all duration-200 text-sm"
                    >
                      🎟 Buy Tickets
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nomination Modal */}
      {showNominateForm && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[hsl(var(--legacy-bg-card))] border border-border rounded-3xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Nominate a Candidate</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Submit nominee details. Organizer will approve or decline.
            </p>

            <div className="space-y-3 mb-4">
              <input
                type="text"
                placeholder="Nominee name"
                value={nomineeName}
                onChange={(e) => setNomineeName(e.target.value)}
                className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3"
              />
              <input
                type="email"
                placeholder="Nominee email (optional)"
                value={nomineeEmail}
                onChange={(e) => setNomineeEmail(e.target.value)}
                className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3"
              />
              <input
                type="tel"
                placeholder="Nominee phone (optional)"
                value={nomineePhone}
                onChange={(e) => setNomineePhone(e.target.value)}
                className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3"
              />
              <textarea
                placeholder="Short bio (optional)"
                value={nomineeBio}
                onChange={(e) => setNomineeBio(e.target.value)}
                className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3 min-h-24"
              />

              {categories.length > 0 ? (
                <select
                  value={nomineeCategoryId}
                  onChange={(e) => setNomineeCategoryId(e.target.value)}
                  className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3"
                >
                  <option value="">Choose category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground px-1">No categories created by organizer yet. You can still submit nomination.</p>
              )}

              <label className="block w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3 cursor-pointer hover:border-[hsl(var(--gold))]/50 transition">
                <span className="text-sm text-muted-foreground">
                  {nomineeImageFile ? 'Change nominee picture' : 'Upload nominee picture (optional)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setNomineeImageFile(file)
                    setNomineeImagePreview(file ? URL.createObjectURL(file) : null)
                  }}
                />
              </label>

              {nomineeImagePreview && (
                <div className="rounded-xl border border-border p-2 bg-[hsl(var(--legacy-bg-input))]">
                  <img
                    src={nomineeImagePreview}
                    alt="Nominee preview"
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleNominationSubmit}
                disabled={submittingNomination || !nomineeName.trim()}
                className="flex-1 px-4 py-3 bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-black rounded-xl font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--legacy-bg-base))] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingNomination ? 'Submitting...' : 'Submit Nomination'}
              </button>
              <button
                onClick={() => {
                  setShowNominateForm(false)
                  setNomineeImageFile(null)
                  setNomineeImagePreview(null)
                }}
                className="flex-1 px-4 py-3 bg-[hsl(var(--legacy-bg-elevated))] border border-border hover:border-[hsl(var(--gold))]/40 hover:bg-[hsl(var(--legacy-bg-card))] rounded-xl transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vote Modal - CRITICAL FIX #4: Phone/Email collection UI */}
      {showVoteModal && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[hsl(var(--legacy-bg-card))] border border-border rounded-3xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 text-foreground">Complete Your Vote</h3>
            
            <p className="text-muted-foreground text-sm mb-6">
              Please provide your contact information to record your vote for <span className="font-semibold text-[hsl(var(--gold))]">{candidates.find(c => c.id === selectedCandidate)?.nominee_name}</span>
            </p>

            <div className="mb-4 p-3 rounded-xl border border-border bg-surface/70 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Votes</span>
                <span className="font-semibold text-foreground">{selectedVoteQuantity}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-[hsl(var(--gold))]">
                  GHS {Number((selectedVoteAmount ?? selectedVoteQuantity * votePrice)).toFixed(2)}
                </span>
              </div>
              {selectedBulkPackageId && (
                <p className="text-xs text-[hsl(var(--gold))] mt-2">Bulk package selected</p>
              )}
            </div>

            {voteModalError && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-red-400 text-sm">
                {voteModalError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-foreground/70 mb-2">Email Address *</label>
                <input
                  type="email"
                  value={voteEmail}
                  onChange={(e) => {
                    setVoteEmail(e.target.value)
                    setVoteModalError('')
                  }}
                  placeholder="your@email.com"
                  className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3 text-foreground placeholder-white/40 focus:border-[hsl(var(--gold))] focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm text-foreground/70 mb-2">Phone Number (optional)</label>
                <input
                  type="tel"
                  value={votePhone}
                  onChange={(e) => {
                    setVotePhone(e.target.value)
                    setVoteModalError('')
                  }}
                  placeholder="+233501234567"
                  className="w-full bg-[hsl(var(--legacy-bg-input))] border border-border rounded-xl px-4 py-3 text-foreground placeholder-white/40 focus:border-[hsl(var(--gold))] focus:outline-none transition"
                />
                <p className="text-xs text-muted-foreground mt-1">Used to prevent duplicate votes</p>
              </div>

            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowVoteModal(false)
                  setVoteModalError('')
                  setVoteEmail('')
                  setVotePhone('')
                }}
                disabled={voting}
                className="flex-1 py-3 rounded-xl bg-[hsl(var(--legacy-bg-elevated))] border border-border hover:border-[hsl(var(--gold))]/40 hover:bg-[hsl(var(--legacy-bg-card))] text-foreground font-semibold active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>

              <button
                onClick={handleVoteSubmit}
                disabled={voting}
                className="flex-1 py-3 rounded-xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-black font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--legacy-bg-base))] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Vote className="w-4 h-4" />
                    Proceed to Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}