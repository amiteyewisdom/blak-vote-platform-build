'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { getPublicUssdShortcode } from '@/lib/ussd-shortcode'
import { openPaymentTab, goToPaymentCheckout, closePaymentTab } from '@/lib/open-payment'
import PublicNav from '@/components/PublicNav'

interface EventData {
  id: string
  title: string
  description: string
  vote_price?: number
  cost_per_vote?: number
  image_url?: string
  banner_url?: string
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

const UI = {
  primary: 'hsl(var(--gold))',
  primaryHover: 'hsl(var(--gold-deep))',
  bg: 'hsl(var(--background))',
  surface: 'hsl(var(--card))',
  textPrimary: 'hsl(var(--foreground))',
  textSecondary: 'hsl(var(--muted-foreground))',
}

export default function PublicVotePage() {
  const params = useParams()
  const eventCode = params.event_code as string

  const [event, setEvent] = useState<EventData | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVotes, setSelectedVotes] = useState<{ [key: string]: number }>({})
  const [selectedVoteInputs, setSelectedVoteInputs] = useState<{ [key: string]: string }>({})
  const [selectedAmounts, setSelectedAmounts] = useState<{ [key: string]: number }>({})
  const [selectedPackageIds, setSelectedPackageIds] = useState<{ [key: string]: string }>({})
  const [bulkPackages, setBulkPackages] = useState<BulkVotePackage[]>([])
  const [receiptEmail, setReceiptEmail] = useState('')
  const [submittingCandidateId, setSubmittingCandidateId] = useState<string | null>(null)
  const { toast } = useToast()
  const votePrice = resolveEventVotePrice(event)
  const ussdShortcode = getPublicUssdShortcode()

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
          const pkgRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(data.event.id)}`, {
            cache: 'no-store',
          })
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
      <div className='flex min-h-screen items-center justify-center' style={{ backgroundColor: UI.bg, color: UI.textPrimary }}>
        <div className='space-y-2 text-center'>
          <div className='mx-auto h-10 w-10 animate-spin rounded-full border-2' style={{ borderColor: 'rgba(255,255,255,0.22)', borderTopColor: UI.primary }} />
          <p className='text-sm' style={{ color: UI.textSecondary }}>Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className='flex min-h-screen items-center justify-center px-4' style={{ backgroundColor: UI.bg, color: UI.textPrimary }}>
        <div className='w-full max-w-md rounded-lg border px-6 py-8 text-center' style={{ backgroundColor: UI.surface, borderColor: 'rgba(255,255,255,0.08)' }}>
          <h1 className='text-2xl font-bold tracking-tight'>Event not found</h1>
          <p className='mt-2 text-sm' style={{ color: UI.textSecondary }}>The voting link may be invalid or no longer available.</p>
        </div>
      </div>
    )
  }

  const handlePayment = async (
    candidateId: string,
    override?: { votes: number; amount: number; bulkPackageId: string | null }
  ) => {
    const votes = override?.votes ?? selectedVotes[candidateId] ?? 1
    const amount = Number(override?.amount ?? selectedAmounts[candidateId] ?? votes * votePrice)
    const rawBulkPackageId = override?.bulkPackageId ?? selectedPackageIds[candidateId] ?? null
    const bulkPackageId = rawBulkPackageId || null

    // Sync the selected package into the input state so the UI reflects the choice.
    if (override) {
      setSelectedVotes((prev) => ({ ...prev, [candidateId]: override.votes }))
      setSelectedVoteInputs((prev) => ({ ...prev, [candidateId]: String(override.votes) }))
      setSelectedAmounts((prev) => ({ ...prev, [candidateId]: override.amount }))
      setSelectedPackageIds((prev) => ({ ...prev, [candidateId]: override.bulkPackageId || '' }))
    }

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

    const paymentTab = openPaymentTab()
    setSubmittingCandidateId(candidateId)

    try {
      const paymentPayload = {
        eventId: event.id,
        candidateId,
        quantity: votes,
        amount,
        bulkPackageId,
        email: receiptEmail.trim(),
      }

      let res: Response | null = null
      const endpoints = ['/api/payments/initialize', '/api/payment-init']
      for (const endpoint of endpoints) {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload),
        })
        if (res.ok || res.status !== 404) break
      }

      if (!res) {
        closePaymentTab(paymentTab)
        toast({
          title: 'Payment Error',
          description: 'Payment initialization failed',
          variant: 'destructive',
        })
        return
      }

      const data = await res.json()

      if (!res.ok) {
        closePaymentTab(paymentTab)
        toast({
          title: 'Payment Error',
          description: data.error || 'Payment initialization failed',
          variant: 'destructive',
        })
        return
      }

      const fallbackAccessCode = typeof data?.access_code === 'string' ? data.access_code.trim() : ''
      const authorizationUrl =
        typeof data?.authorization_url === 'string' && data.authorization_url.trim().length > 0
          ? data.authorization_url.trim()
          : fallbackAccessCode
            ? `https://checkout.paystack.com/${fallbackAccessCode}`
            : null

      if (!authorizationUrl) {
        closePaymentTab(paymentTab)
        toast({
          title: 'Payment Error',
          description: 'Unable to start Paystack checkout. Please try again.',
          variant: 'destructive',
        })
        return
      }

      try {
        const url = new URL(authorizationUrl)

        const isTrustedPaystackHost =
          url.hostname === 'paystack.com' ||
          url.hostname.endsWith('.paystack.com')

        if (!isTrustedPaystackHost) {
          throw new Error('Invalid payment redirect domain')
        }

        if (!url.protocol.startsWith('https')) {
          throw new Error('Payment URL must use HTTPS')
        }

        goToPaymentCheckout(authorizationUrl, paymentTab)
      } catch (urlError) {
        closePaymentTab(paymentTab)
        console.error('Invalid payment URL:', authorizationUrl, urlError)
        toast({
          title: 'Security Error',
          description: 'Received invalid payment URL from server',
          variant: 'destructive',
        })
      }
    } catch (error) {
      closePaymentTab(paymentTab)
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setSubmittingCandidateId(null)
    }
  }

  const heroImage = event.image_url || event.banner_url

  return (
    <div className='min-h-screen ui-page-fade' style={{ backgroundColor: UI.bg, color: UI.textPrimary }}>
      <PublicNav />
      <section
        className='mx-3 mt-3 rounded-xl bg-cover bg-center bg-no-repeat px-4 py-10 sm:mx-8 sm:mt-4 sm:rounded-2xl sm:px-8 sm:py-16'
        style={{
          backgroundImage: heroImage
            ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${heroImage})`
            : 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6))',
          backgroundColor: UI.surface,
        }}
      >
        <div className='mx-auto max-w-5xl text-center ui-hero-enter'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.18em] sm:text-sm' style={{ color: UI.textSecondary }}>
            Public Voting
          </p>
          <h1 className='mt-3 text-2xl font-extrabold tracking-[0.02em] sm:mt-4 sm:text-4xl md:text-5xl'>
            {event.title}
          </h1>
          <p className='mx-auto mt-3 max-w-3xl text-sm leading-relaxed sm:mt-4 sm:text-base' style={{ color: UI.textSecondary }}>
            {event.description}
          </p>
          <div className='mt-6 sm:mt-8'>
            <button type='button' className='ui-pill-btn w-full sm:w-auto'>
              Start Voting
            </button>
          </div>
        </div>
      </section>

      <main className='mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10'>
        <div className='mb-6 rounded-2xl border p-4 sm:mb-8 sm:p-6' style={{ backgroundColor: UI.surface, borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className='grid gap-4 md:grid-cols-3 md:items-end'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.textSecondary }}>Price per vote</p>
              <p className='mt-2 text-xl font-bold sm:text-2xl'>GHS {votePrice.toFixed(2)}</p>
            </div>
            <div className='md:col-span-2'>
              <label className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.textSecondary }}>
                Receipt email
              </label>
              <Input
                type='email'
                value={receiptEmail}
                onChange={(event) => setReceiptEmail(event.target.value)}
                placeholder='you@example.com'
                className='mt-2 h-11 rounded-xl border px-4 sm:h-12'
                style={{ borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.02)', color: UI.textPrimary }}
              />
            </div>
          </div>

          <div className='mt-4 rounded-xl border px-4 py-3' style={{ borderColor: 'rgba(250, 204, 21, 0.35)', backgroundColor: 'rgba(250, 204, 21, 0.09)' }}>
            <p className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.primary }}>Offline voting</p>
            <p className='mt-1 text-sm' style={{ color: UI.textPrimary }}>
              Dial <span className='font-semibold'>{ussdShortcode}</span> to vote by USSD if you do not have internet.
            </p>
          </div>
        </div>

        <section className='rounded-2xl border' style={{ backgroundColor: UI.surface, borderColor: 'rgba(255,255,255,0.08)' }}>
          {candidates.map((candidate, index) => {
            const votes = selectedVotes[candidate.id] ?? 1
            const voteInputValue = selectedVoteInputs[candidate.id] ?? String(votes)
            const baseTotal = Number((votes * votePrice).toFixed(2))
            const total = Number((selectedAmounts[candidate.id] ?? baseTotal).toFixed(2))
            const savings = Math.max(0, Number((baseTotal - total).toFixed(2)))
            const unitPrice = Number((total / votes).toFixed(4))

            return (
              <article
                key={candidate.id}
                className='ui-row-fade px-4 py-4 sm:px-6'
                style={{
                  borderBottom: index === candidates.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  animationDelay: `${index * 60}ms`,
                }}
              >
                <div className='flex flex-col gap-4 lg:gap-6'>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
                    <div className='flex min-w-0 items-center gap-3'>
                      {candidate.photo_url ? (
                        <img
                          src={candidate.photo_url}
                          alt={candidate.name}
                          className='h-10 w-10 rounded-lg object-cover sm:h-12 sm:w-12'
                        />
                      ) : (
                        <div
                          className='flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold sm:h-12 sm:w-12 sm:text-sm'
                          style={{ backgroundColor: 'rgba(225,29,72,0.18)', color: UI.textPrimary }}
                        >
                          {candidate.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className='min-w-0'>
                        <h2 className='truncate text-base font-bold leading-tight sm:text-xl'>{candidate.name}</h2>
                        <p className='mt-1 text-sm' style={{ color: UI.textSecondary }}>
                          Code: {candidate.voting_code}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() =>
                        handlePayment(candidate.id, {
                          votes,
                          amount: total,
                          bulkPackageId: null,
                        })
                      }
                      className='ui-pill-btn h-auto w-full px-5 py-3 sm:w-auto'
                      disabled={submittingCandidateId === candidate.id}
                    >
                      {submittingCandidateId === candidate.id ? 'Redirecting...' : 'Vote'}
                    </Button>
                  </div>

                  <p className='text-sm leading-relaxed' style={{ color: UI.textSecondary }}>
                    {candidate.bio || 'No biography provided for this candidate.'}
                  </p>

                  <div className='grid gap-3 sm:grid-cols-2 sm:gap-4'>
                    <div>
                      <label className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.textSecondary }}>
                        Single vote purchase
                      </label>
                      <Input
                        type='number'
                        min='1'
                        value={voteInputValue}
                        onChange={(event) => {
                          const rawValue = event.target.value
                          setSelectedVoteInputs({
                            ...selectedVoteInputs,
                            [candidate.id]: rawValue,
                          })

                          const nextVotes = Number(rawValue)
                          if (!Number.isFinite(nextVotes) || nextVotes < 1) {
                            return
                          }

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
                        onBlur={() => {
                          const rawValue = selectedVoteInputs[candidate.id]
                          const parsedVotes = Number(rawValue)
                          const nextVotes = Number.isFinite(parsedVotes) && parsedVotes >= 1 ? parsedVotes : 1

                          setSelectedVotes({
                            ...selectedVotes,
                            [candidate.id]: nextVotes,
                          })
                          setSelectedVoteInputs({
                            ...selectedVoteInputs,
                            [candidate.id]: String(nextVotes),
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
                        className='mt-2 h-11 rounded-xl border px-4 sm:h-12'
                        style={{ borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.02)', color: UI.textPrimary }}
                      />
                    </div>

                    <div>
                      <label className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.textSecondary }}>
                        Amount to pay
                      </label>
                      <Input
                        type='number'
                        min='0.01'
                        step='0.01'
                        value={total}
                        onChange={(event) => {
                          const nextAmount = Number(event.target.value)
                          setSelectedAmounts({
                            ...selectedAmounts,
                            [candidate.id]: Number.isFinite(nextAmount) ? nextAmount : 0,
                          })
                        }}
                        className='mt-2 h-11 rounded-xl border px-4 sm:h-12'
                        style={{ borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.02)', color: UI.textPrimary }}
                      />
                    </div>
                  </div>

                  <div className='rounded-xl border p-3 text-sm sm:p-4' style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <p>You are purchasing {votes} votes for GHS {total.toFixed(2)}</p>
                    <p className='mt-1' style={{ color: UI.textSecondary }}>Effective price per vote: GHS {unitPrice.toFixed(4)}</p>
                    {savings > 0 ? <p className='mt-1' style={{ color: '#34D399' }}>You saved GHS {savings.toFixed(2)}</p> : null}
                    <div className='mt-3 flex items-center justify-between gap-3 text-sm'>
                      <span style={{ color: UI.textSecondary }}>Total payable</span>
                      <span className='font-semibold'>GHS {total.toFixed(2)}</span>
                    </div>
                  </div>

                  {bulkPackages.length > 0 ? (
                    <div className='space-y-3'>
                      <p className='text-xs font-semibold uppercase tracking-[0.16em]' style={{ color: UI.textSecondary }}>Bulk vote packages</p>
                      <div className='grid gap-2 sm:grid-cols-2'>
                        {bulkPackages.map((pkg) => {
                          const packageVotes = Number(pkg.votes_included)
                          const packagePrice = Number(pkg.price_per_package)
                          const retail = Number((packageVotes * votePrice).toFixed(2))
                          const packageSavings = Math.max(0, Number((retail - packagePrice).toFixed(2)))

                          return (
                            <button
                              key={pkg.id}
                              type='button'
                              className='rounded-xl border px-3 py-3 text-left transition sm:px-4'
                              style={{
                                borderColor: 'rgba(255,255,255,0.08)',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                              }}
                              onClick={() =>
                                handlePayment(candidate.id, {
                                  votes: packageVotes,
                                  amount: packagePrice,
                                  bulkPackageId: pkg.id,
                                })
                              }
                              disabled={submittingCandidateId === candidate.id}
                            >
                              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
                                <div>
                                  <p className='text-sm font-semibold' style={{ color: UI.textPrimary }}>
                                    {packageVotes} votes for GHS {packagePrice.toFixed(2)}
                                  </p>
                                  <p className='text-xs' style={{ color: UI.textSecondary }}>
                                    {pkg.description || 'Organizer bulk package'}
                                  </p>
                                </div>
                                {packageSavings > 0 ? (
                                  <span className='text-xs' style={{ color: '#34D399' }}>
                                    Save GHS {packageSavings.toFixed(2)}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </section>
      </main>

      <style jsx>{`
        .ui-page-fade {
          animation: uiFadeIn 420ms ease-out both;
        }

        .ui-hero-enter {
          animation: uiHeroIn 560ms ease-out both;
        }

        .ui-row-fade {
          animation: uiRowIn 420ms ease-out both;
          will-change: transform, opacity;
          transition: background-color 200ms ease;
        }

        .ui-row-fade:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .ui-pill-btn {
          background: ${UI.primary};
          color: ${UI.textPrimary};
          border-radius: 9999px;
          padding: 11px 18px;
          font-weight: 600;
          transition: background-color 200ms ease, transform 200ms ease;
        }

        .ui-pill-btn:hover {
          background: ${UI.primaryHover};
        }

        .ui-pill-btn:active {
          transform: scale(0.97);
        }

        @keyframes uiFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes uiHeroIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes uiRowIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
