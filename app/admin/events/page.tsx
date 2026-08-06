"use client"

import { useEffect, useMemo, useState } from "react"
import { isLiveEventStatus } from "@/lib/event-status"
import { formatGHS } from "@/lib/utils"

type OrganizerProfile = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

type AdminEvent = {
  id: string
  title?: string | null
  status?: string | null
  event_type?: string | null
  image_url?: string | null
  banner_url?: string | null
  total_revenue?: number | null
  total_withdrawn?: number | null
  available_withdrawal_balance?: number | null
  admin_profit?: number | null
  organizer_id?: string | null
  created_at?: string | null
  profiles?: OrganizerProfile | null
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [organizerFilter, setOrganizerFilter] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      const response = await fetch("/api/admin/events", { cache: "no-store" })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        console.error("[AdminEvents] Failed to fetch events", payload?.error || response.statusText)
        setEvents([])
        return
      }

      const fetchedEvents = Array.isArray(payload?.events) ? payload.events : []
      setEvents(fetchedEvents as AdminEvent[])
    } finally {
      setLoading(false)
    }
  }

  const suspendEvent = async (id: string) => {
    setProcessingId(id)

    await fetch("/api/admin/suspend-event", {
      method: "POST",
      body: JSON.stringify({ eventId: id }),
    })

    await fetchEvents()
    setProcessingId(null)
  }

  const unsuspendEvent = async (id: string) => {
    setProcessingId(id)

    await fetch("/api/admin/unsuspend-event", {
      method: "POST",
      body: JSON.stringify({ eventId: id }),
    })

    await fetchEvents()
    setProcessingId(null)
  }

  const deleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return

    setProcessingId(id)

    await fetch("/api/admin/delete-event", {
      method: "POST",
      body: JSON.stringify({ eventId: id }),
    })

    await fetchEvents()
    setProcessingId(null)
  }

  const organizerName = (event: AdminEvent) => {
    const name = `${event.profiles?.first_name || ''} ${event.profiles?.last_name || ''}`.trim()
    return name || event.profiles?.email || 'Unknown organizer'
  }

  const eventImage = (event: AdminEvent) => {
    return event.image_url || event.banner_url || null
  }

  const organizers = useMemo(() => Array.from(new Set(events.map(organizerName))).sort(), [events])
  const filteredEvents = useMemo(() => events.filter((event) => {
    const createdDate = event.created_at ? event.created_at.slice(0, 10) : ''
    return (!searchTerm.trim() || String(event.title || '').toLowerCase().includes(searchTerm.trim().toLowerCase())) &&
      (!organizerFilter || organizerName(event) === organizerFilter) &&
      (!createdFrom || (createdDate && createdDate >= createdFrom)) &&
      (!createdTo || (createdDate && createdDate <= createdTo))
  }), [events, searchTerm, organizerFilter, createdFrom, createdTo])

  if (loading) {
    return <div className="p-4 md:p-8 text-foreground">Loading events...</div>
  }

  return (
    <div className="p-4 md:p-8 text-foreground space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">All Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage organizer events and view platform profit.</p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search event name" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" />
        <select value={organizerFilter} onChange={(e) => setOrganizerFilter(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">All organizers</option>
          {organizers.map((organizer) => <option key={organizer} value={organizer}>{organizer}</option>)}
        </select>
        <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" aria-label="Created from" />
        <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" aria-label="Created to" />
      </div>

      {filteredEvents.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface-card p-6 text-center text-muted-foreground md:p-8">
          No matching events found.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredEvents.map(event => (
          <div
            key={event.id}
            className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
          >
            <div className="relative h-40 w-full overflow-hidden bg-muted">
              {eventImage(event) ? (
                <img
                  src={eventImage(event) as string}
                  alt={event.title || 'Event'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
                  No event image
                </div>
              )}
              <div className="absolute top-3 left-3">
                <StatusBadge status={event.status} />
              </div>
            </div>

            <div className="p-4 md:p-5 flex-1 flex flex-col">
              <div className="flex-1">
                <h3 className="font-semibold text-lg line-clamp-1">{event.title}</h3>

                <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                  {organizerName(event)} {event.profiles?.email ? `(${event.profiles.email})` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created: {event.created_at ? new Date(event.created_at).toLocaleDateString() : 'Unknown'}
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  Active: {isLiveEventStatus(event.status) ? 'Yes' : 'No'}
                  {event.event_type && ` · ${event.event_type}`}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="font-semibold text-yellow-400">{formatGHS(event.total_revenue)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Withdrawn</p>
                  <p className="text-muted-foreground">{formatGHS(event.total_withdrawn)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="font-semibold text-emerald-400">{formatGHS(event.available_withdrawal_balance)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Admin Profit</p>
                  <p className="font-semibold text-blue-400">{formatGHS(event.admin_profit)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {isLiveEventStatus(event.status) && (
                  <button
                    onClick={() => suspendEvent(event.id)}
                    disabled={processingId === event.id}
                    className="min-h-10 px-3 py-2 text-sm rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 disabled:opacity-50"
                  >
                    {processingId === event.id ? "Processing..." : "Suspend"}
                  </button>
                )}

                {event.status === "cancelled" && (
                  <button
                    onClick={() => unsuspendEvent(event.id)}
                    disabled={processingId === event.id}
                    className="min-h-10 px-3 py-2 text-sm rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {processingId === event.id ? "Processing..." : "Reactivate"}
                  </button>
                )}

                <button
                  onClick={() => deleteEvent(event.id)}
                  disabled={processingId === event.id}
                  className="min-h-10 px-3 py-2 text-sm rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                >
                  {processingId === event.id ? "Processing..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (isLiveEventStatus(status)) {
    return <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/30">Active</span>
  }

  return <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 border border-red-500/30">{status || 'Inactive'}</span>
}
