'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, Loader2, MapPin, Minus, Plus, RefreshCw, ShieldCheck, Ticket, Zap } from 'lucide-react'
import { TicketQRCode } from '@/components/TicketQRCode'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type TicketPlan = {
  id: string
  event_id: string
  name: string
  description?: string
  created_at?: string
  price: number
  admin_fee: number
  totalQuantity: number
  soldCount: number
  remainingQuantity: number
  isSoldOut: boolean
}

type PublicEvent = {
  id: string
  title?: string
  name?: string
  description?: string
  image_url?: string
  banner_url?: string
  start_date?: string
  end_date?: string
  location?: string
  venue?: string
}

export default function PublicEventTicketsPage() {
  const params = useParams()
  const eventCode = String(params?.eventId || '')
  const router = useRouter()

  const [eventId, setEventId] = useState('')
  const [eventData, setEventData] = useState<PublicEvent | null>(null)
  const [tickets, setTickets] = useState<TicketPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issuedCodes, setIssuedCodes] = useState<string[]>([])

  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [ticketTypeFilter, setTicketTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  const loadTickets = async (resolvedEventId: string) => {
    const ticketRes = await fetch(`/api/tickets/public?eventId=${resolvedEventId}`)
    const ticketPayload = await ticketRes.json()

    if (!ticketRes.ok) {
      setError(ticketPayload.error || 'Unable to load tickets')
      setTickets([])
      return
    }

    const plans = ticketPayload.tickets || []
    setTickets(plans)
    setSelectedTicketId((current) => {
      if (current && plans.some((plan: TicketPlan) => plan.id === current && !plan.isSoldOut)) {
        return current
      }
      const firstAvailable = plans.find((plan: TicketPlan) => !plan.isSoldOut)
      return firstAvailable?.id || null
    })
    setQuantities((current) => {
      const next = { ...current }
      for (const plan of plans) {
        if (!next[plan.id]) {
          next[plan.id] = 1
        }
      }
      return next
    })
  }

  useEffect(() => {
    const load = async () => {
      const eventRes = await fetch(`/api/events/public?code=${eventCode}`)
      const eventPayload = await eventRes.json()

      if (!eventRes.ok || !eventPayload.event?.id) {
        setError(eventPayload.error || 'Event not found')
        setLoading(false)
        return
      }

      setEventId(eventPayload.event.id)
      setEventData(eventPayload.event)
      await loadTickets(eventPayload.event.id)
      setLoading(false)
    }

    if (eventCode) {
      void load()
    }
  }, [eventCode])

  useEffect(() => {
    if (!eventId) return

    const timer = window.setInterval(() => {
      void loadTickets(eventId)
    }, 45000)

    return () => window.clearInterval(timer)
  }, [eventId])

  const refreshData = async () => {
    if (!eventId || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      await loadTickets(eventId)
    } finally {
      setRefreshing(false)
    }
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesType = ticketTypeFilter === 'all' || ticket.id === ticketTypeFilter
      if (!matchesType) return false

      if (!dateFilter) return true
      if (!ticket.created_at) return false

      const createdDate = new Date(ticket.created_at)
      const filterDate = new Date(dateFilter)
      return (
        createdDate.getFullYear() === filterDate.getFullYear() &&
        createdDate.getMonth() === filterDate.getMonth() &&
        createdDate.getDate() === filterDate.getDate()
      )
    })
  }, [tickets, ticketTypeFilter, dateFilter])

  const ticketTypeOptions = useMemo(
    () =>
      tickets.map((ticket, index) => ({
        value: ticket.id,
        label: ticket.name?.trim() || `Untitled plan ${index + 1}`,
      })),
    [tickets]
  )

  useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId(null)
      return
    }

    if (!selectedTicketId || !filteredTickets.some((ticket) => ticket.id === selectedTicketId && !ticket.isSoldOut)) {
      const firstAvailable = filteredTickets.find((ticket) => !ticket.isSoldOut)
      setSelectedTicketId(firstAvailable?.id || filteredTickets[0].id)
    }
  }, [filteredTickets, selectedTicketId])

  const selectedTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [filteredTickets, selectedTicketId]
  )

  const selectedQuantity = selectedTicket
    ? Math.max(1, Math.min(quantities[selectedTicket.id] || 1, Math.max(selectedTicket.remainingQuantity, 1)))
    : 0

  const selectedTotal = selectedTicket ? Number(selectedTicket.price || 0) * selectedQuantity : 0
  const isSoldOut = filteredTickets.length > 0 && filteredTickets.every((ticket) => ticket.isSoldOut)
  const hasValidSelection = !!selectedTicket && !selectedTicket.isSoldOut && selectedQuantity >= 1 && selectedQuantity <= selectedTicket.remainingQuantity

  const initializePayment = async (payload: Record<string, unknown>) => {
    let response = await fetch('/api/payment-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (response.status === 404) {
      response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (response.status === 404) {
      response = await fetch('/api/payments/create-checkout/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    return response
  }

  const buyTicket = async () => {
    if (!buyerName || !buyerEmail) {
      setError('Buyer name and email are required')
      return
    }

    if (!selectedTicketId) {
      setError('Select a ticket plan to continue')
      return
    }

    const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId)
    if (!selectedTicket) {
      setError('Ticket plan not found')
      return
    }

    const quantity = Math.max(1, Math.min(quantities[selectedTicket.id] || 1, selectedTicket.remainingQuantity || 1))
    if (quantity > selectedTicket.remainingQuantity) {
      setError('Requested quantity exceeds available inventory')
      return
    }

    const isPaidTicket = Number(selectedTicket.price || 0) > 0
    const normalizedBuyerPhone = buyerPhone.trim()

    if (normalizedBuyerPhone && !/^\+?[1-9]\d{6,14}$/.test(normalizedBuyerPhone)) {
      setError('Phone must be in international format, e.g. +233501234567')
      return
    }

    setBusy(true)
    setFeedback(null)
    setError(null)
    setIssuedCodes([])

    const requestBody = isPaidTicket
      ? {
          paymentFor: 'ticket',
          ticketId: selectedTicket.id,
          quantity,
          buyerName,
          buyerEmail,
          buyerPhone: normalizedBuyerPhone || undefined,
        }
      : {
          ticketId: selectedTicket.id,
          quantity,
          buyerName,
          buyerEmail,
          buyerPhone: normalizedBuyerPhone || undefined,
        }

    const res = isPaidTicket
      ? await initializePayment(requestBody)
      : await fetch('/api/tickets/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

    const payload = await res.json()

    if (isPaidTicket && res.ok && payload.authorization_url) {
      window.location.href = payload.authorization_url
      return
    }

    if (!res.ok) {
      setError(payload.error || 'Unable to purchase ticket')
      setBusy(false)
      return
    }

    setFeedback(payload.message || 'Ticket purchase completed')
    setIssuedCodes(payload.ticketCodes || [])
    if (eventId) {
      await loadTickets(eventId)
    }

    setBusy(false)
  }

  const eventTitle = eventData?.title || eventData?.name || 'Event Tickets'
  const eventDate = eventData?.start_date || eventData?.end_date
  const eventVenue = eventData?.location || eventData?.venue
  const eventImage = eventData?.image_url || eventData?.banner_url

  return (
    <div className="min-h-screen bg-[hsl(var(--legacy-bg-base))] text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="px-0 text-foreground/80 hover:text-foreground">
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button variant="secondary" onClick={() => void refreshData()} disabled={refreshing || loading}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        <Card className="overflow-hidden border-border shadow-[0_10px_35px_hsl(var(--foreground)/0.08)]">
          {eventImage ? (
            <div className="h-48 w-full overflow-hidden md:h-64">
              <img src={eventImage} alt={eventTitle} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-48 w-full bg-gradient-to-r from-surface to-card md:h-64" />
          )}
          <CardContent className="space-y-4 pt-6">
            <h1 className="text-2xl font-bold md:text-3xl">{eventTitle}</h1>
            {!!eventData?.description && <p className="text-sm text-muted-foreground md:text-base">{eventData.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {eventDate && (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {new Date(eventDate).toLocaleString()}
                </span>
              )}
              {eventVenue && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {eventVenue}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {(feedback || error || issuedCodes.length > 0) && (
          <Card className={`${error ? 'border-destructive/40' : 'border-emerald-500/40'} shadow-[0_10px_30px_hsl(var(--foreground)/0.06)]`}>
            <CardContent className="space-y-4 pt-6">
              {(feedback || error) && (
                <p className={`font-medium ${error ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {error || feedback}
                </p>
              )}
              {issuedCodes.length > 0 && (
                <>
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">Payment Successful</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Your ticket code(s) are ready. Save the QR code(s) for entry.</p>
                  <div className="flex flex-wrap gap-6">
                    {issuedCodes.map((code) => (
                      <TicketQRCode key={code} code={code} label={code} size={160} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr,1fr] lg:items-start">
          <div className="space-y-6">
            <Card className="border-border shadow-[0_10px_30px_hsl(var(--foreground)/0.07)]">
              <CardHeader>
                <CardTitle>Buyer Information</CardTitle>
                <CardDescription>Enter contact details for payment and instant ticket delivery.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your full name" />
                <Input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="Your email" type="email" />
                <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Phone (optional)" />
              </CardContent>
            </Card>

            <Card className="border-border shadow-[0_10px_30px_hsl(var(--foreground)/0.07)]">
              <CardHeader>
                <CardTitle>Ticket Selection</CardTitle>
                <CardDescription>Choose your ticket type and quantity before checkout.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Filter by ticket type</label>
                    <select
                      className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm text-foreground"
                      value={ticketTypeFilter}
                      onChange={(e) => setTicketTypeFilter(e.target.value)}
                    >
                      <option value="all">All ticket types</option>
                      {ticketTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Filter by date</label>
                    <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tickets...
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <p className="text-muted-foreground">No tickets match the selected filters.</p>
                ) : tickets.length === 0 ? (
                  <p className="text-muted-foreground">No tickets available yet.</p>
                ) : isSoldOut ? (
                  <div className="rounded-xl border border-border bg-surface/70 p-6 text-center">
                    <p className="text-xl font-semibold">Sold Out</p>
                    <p className="mt-2 text-sm text-muted-foreground">All ticket plans are sold out for this event.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredTickets.map((ticket) => {
                      const quantity = Math.max(1, Math.min(quantities[ticket.id] || 1, Math.max(ticket.remainingQuantity, 1)))
                      const selected = selectedTicketId === ticket.id

                      return (
                        <div
                          key={ticket.id}
                          role="button"
                          tabIndex={ticket.isSoldOut ? -1 : 0}
                          aria-disabled={ticket.isSoldOut}
                          onClick={() => !ticket.isSoldOut && setSelectedTicketId(ticket.id)}
                          onKeyDown={(e) => {
                            if (ticket.isSoldOut) return
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedTicketId(ticket.id)
                            }
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition-all ${selected ? 'border-gold shadow-[0_8px_24px_hsl(var(--gold)/0.18)] ring-1 ring-gold/20' : 'border-border hover:border-gold/50'} ${ticket.isSoldOut ? 'opacity-55 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <Ticket size={16} className="text-[hsl(var(--gold))]" />
                                <p className="font-semibold">{ticket.name || 'Ticket'}</p>
                              </div>
                              {!!ticket.description && <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>}
                              <p className="mt-2 text-sm text-muted-foreground">{ticket.remainingQuantity} left</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-[hsl(var(--gold))]">GHS {Number(ticket.price || 0).toFixed(2)}</p>
                              {ticket.isSoldOut ? <Badge variant="destructive">Sold Out</Badge> : <Badge variant="secondary">Available</Badge>}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span>Sold: {ticket.soldCount}</span>
                            <span>Total: {ticket.totalQuantity}</span>
                          </div>
                          <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={ticket.isSoldOut || quantity <= 1}
                              onClick={() =>
                                setQuantities((current) => ({
                                  ...current,
                                  [ticket.id]: Math.max(1, (current[ticket.id] || 1) - 1),
                                }))
                              }
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              className="h-11 w-20 text-center"
                              type="number"
                              min={1}
                              max={Math.max(ticket.remainingQuantity, 1)}
                              value={quantity}
                              disabled={ticket.isSoldOut}
                              onChange={(e) => {
                                const nextValue = Number(e.target.value)
                                setQuantities((current) => ({
                                  ...current,
                                  [ticket.id]: Number.isFinite(nextValue)
                                    ? Math.max(1, Math.min(nextValue, Math.max(ticket.remainingQuantity, 1)))
                                    : 1,
                                }))
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={ticket.isSoldOut || quantity >= ticket.remainingQuantity}
                              onClick={() =>
                                setQuantities((current) => ({
                                  ...current,
                                  [ticket.id]: Math.min(ticket.remainingQuantity, (current[ticket.id] || 1) + 1),
                                }))
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="border-border shadow-[0_12px_35px_hsl(var(--foreground)/0.1)]">
              <CardHeader>
                <CardTitle>Purchase Summary</CardTitle>
                <CardDescription>Review your order before payment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTicket ? (
                  <div className="rounded-xl border border-border bg-surface/60 p-4">
                    <p className="font-semibold">{selectedTicket.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedQuantity} × GHS {Number(selectedTicket.price || 0).toFixed(2)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedQuantity} × {selectedTicket.name} = GHS {selectedTotal.toFixed(2)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ticket selected yet.</p>
                )}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-[hsl(var(--gold))]">GHS {selectedTotal.toFixed(2)}</span>
                </div>

                <Button className="w-full" size="lg" disabled={busy || !hasValidSelection || !buyerName || !buyerEmail || isSoldOut} onClick={() => void buyTicket()}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : 'Proceed to Payment'}
                </Button>

                <div className="space-y-2 rounded-xl border border-border bg-surface/40 p-4 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Secure payment</p>
                  <p className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-[hsl(var(--gold))]" /> Instant ticket delivery after payment</p>
                  <p>Tickets are subject to event organizer policy.</p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}