'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Vote } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { isVotingOpenStatus } from '@/lib/event-status'

interface BulkVotePackage {
  id: string
  votes_included: number
  price_per_package: number
  description?: string | null
}

interface Candidate {
  id: string
  nominee_name: string
  bio?: string | null
  photo_url?: string | null
}

export default function CandidateVotePage() {
  const params = useParams()
  const eventCode = String(params?.eventId || '')
  const candidateId = String(params?.candidateId || '')
  const { toast } = useToast()

  const [event, setEvent] = useState<any>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [bulkPackages, setBulkPackages] = useState<BulkVotePackage[]>([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [voteEmail, setVoteEmail] = useState('')
  const [votePhone, setVotePhone] = useState('')
  const [quantity, setQuantity] = useState('')

  const votePrice = resolveEventVotePrice(event)
  const votingOpen = isVotingOpenStatus(event?.status)
  const parsedQty = quantity.trim() ? Number.parseInt(quantity, 10) : 0
  const validQty = Number.isFinite(parsedQty) && parsedQty >= 1 && parsedQty <= 1000 ? parsedQty : 1

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`/api/events/public?code=${eventCode}`)
        const payload = await res.json()

        if (!res.ok || !payload?.event) {
          setLoading(false)
          return
        }

        const candidates = payload.candidates || []
        const row = candidates.find((item: any) =>
          String(item.id) === candidateId ||
          String(item.short_code) === candidateId ||
          String(item.voting_code) === candidateId
        )

        setEvent(payload.event)
        setCandidate(
          row
            ? {
                id: row.id,
                nominee_name: row.nominee_name || row.name,
                bio: row.bio || null,
                photo_url: row.photo_url || null,
              }
            : null
        )

        if (payload?.event?.id) {
          const pkgRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(payload.event.id)}`)
          if (pkgRes.ok) {
            const pkgPayload = await pkgRes.json()
            setBulkPackages((pkgPayload.packages || []) as BulkVotePackage[])
          }
        }
      } finally {
        setLoading(false)
      }
    }

    if (eventCode && candidateId) {
      void loadData()
    }
  }, [eventCode, candidateId])

  const customAmount = useMemo(() => Number((validQty * votePrice).toFixed(2)), [validQty, votePrice])

  const startPayment = async (voteQty: number, amount: number, bulkPackageId: string | null) => {
    if (!event?.id || !candidate?.id || !votingOpen) return

    if (!voteEmail.trim()) {
      toast({ title: 'Email is required', description: 'Enter your email to continue payment.', variant: 'destructive' })
      return
    }

    setVoting(true)

    try {
      const paymentPayload = {
        eventId: event.id,
        candidateId: candidate.id,
        quantity: voteQty,
        bulkPackageId: bulkPackageId || undefined,
        amount,
        email: voteEmail.trim(),
        phone: votePhone.trim() || undefined,
      }

      let res = await fetch('/api/payment-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload),
      })

      // Only fall through to the next endpoint if the route itself is missing (404).
      // Do NOT retry on 429 (rate limit), 4xx errors, or 5xx — those are real errors.
      if (res.status === 404) {
        res = await fetch('/api/payments/create-checkout/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload),
        })
      }

      const payload = await res.json()

      if (!res.ok) {
        toast({ title: 'Payment Error', description: payload.error || 'Payment initialization failed', variant: 'destructive' })
        setVoting(false)
        return
      }

      const fallbackAccessCode = typeof payload?.access_code === 'string' ? payload.access_code.trim() : ''
      const authorizationUrl =
        typeof payload?.authorization_url === 'string' && payload.authorization_url.trim().length > 0
          ? payload.authorization_url.trim()
          : fallbackAccessCode
            ? `https://checkout.paystack.com/${fallbackAccessCode}`
            : null

      if (!authorizationUrl) {
        toast({ title: 'Payment Error', description: 'Unable to start Paystack checkout. Please try again.', variant: 'destructive' })
        setVoting(false)
        return
      }

      const redirectUrl = new URL(authorizationUrl)
      const isTrustedPaystackHost =
        redirectUrl.hostname === 'paystack.com' ||
        redirectUrl.hostname.endsWith('.paystack.com')

      if (!isTrustedPaystackHost || !redirectUrl.protocol.startsWith('https')) {
        toast({ title: 'Security Error', description: 'Received invalid payment URL from server', variant: 'destructive' })
        setVoting(false)
        return
      }

      window.location.href = authorizationUrl
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' })
      setVoting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    )
  }

  if (!event || !candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-semibold">Candidate not found</p>
          <Link href={`/events/${eventCode}`} className="mt-4 inline-flex items-center gap-2 text-sm text-gold">
            <ArrowLeft className="h-4 w-4" />
            Back to event
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <Link href={`/events/${eventCode}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to nominees
        </Link>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected nominee</p>
          <h1 className="mt-2 text-2xl font-bold">{candidate.nominee_name}</h1>
          {candidate.bio ? <p className="mt-2 text-sm text-muted-foreground">{candidate.bio}</p> : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          {!votingOpen && (
            <div className="rounded-xl border border-border bg-surface/70 p-3 text-sm text-muted-foreground">
              Voting is currently closed for this event.
            </div>
          )}

          <div>
            <label className="text-sm text-foreground/80">Email address</label>
            <input
              type="email"
              value={voteEmail}
              onChange={(e) => setVoteEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-2 w-full rounded-xl border border-border bg-[hsl(var(--legacy-bg-input))] px-4 py-3"
            />
          </div>

          <div>
            <label className="text-sm text-foreground/80">Phone number (optional)</label>
            <input
              type="tel"
              value={votePhone}
              onChange={(e) => setVotePhone(e.target.value)}
              placeholder="0501234567"
              className="mt-2 w-full rounded-xl border border-border bg-[hsl(var(--legacy-bg-input))] px-4 py-3"
            />
          </div>

          <div>
            <label className="text-sm text-foreground/80">Number of votes</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-[hsl(var(--legacy-bg-input))] px-4 py-3"
            />
            <p className="mt-2 text-sm text-muted-foreground">Total: GHS {customAmount.toFixed(2)}</p>
          </div>

          <button
            type="button"
            disabled={voting || !votingOpen}
            onClick={() => startPayment(validQty, customAmount, null)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-4 py-3 font-semibold text-black disabled:opacity-50"
          >
            <Vote className="h-4 w-4" />
            {voting ? 'Processing...' : 'Continue to payment'}
          </button>
        </div>

        {bulkPackages.length > 0 && (
          <div className="rounded-2xl border border-[hsl(var(--gold))]/25 bg-[hsl(var(--gold))]/10 p-5 space-y-3">
            <p className="text-sm font-semibold text-[hsl(var(--gold))]">Bulk vote packages</p>
            {bulkPackages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                disabled={voting || !votingOpen}
                onClick={() => startPayment(Number(pkg.votes_included), Number(pkg.price_per_package), pkg.id)}
                className="w-full rounded-xl border border-[hsl(var(--gold))]/30 bg-surface/80 px-4 py-3 text-left disabled:opacity-50"
              >
                <p className="text-sm font-semibold">{pkg.votes_included} votes for GHS {Number(pkg.price_per_package).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{pkg.description || 'Organizer bulk package'}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
