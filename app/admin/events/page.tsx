"use client"

import { useEffect, useMemo, useState } from "react"
import { isLiveEventStatus } from "@/lib/event-status"

type OrganizerProfile = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

type AdminEvent = {
  id: string
  title?: string | null
  status?: string | null
  total_revenue?: number | null
  total_withdrawn?: number | null
  available_withdrawal_balance?: number | null
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
        <p className="mt-1 text-sm text-muted-foreground">Suspend, reactivate, or remove organizer events.</p>
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

      <div className="space-y-4">
        {filteredEvents.map(event => (
          <div
            key={event.id}
            className="rounded-2xl border border-border bg-card p-4 md:p-5"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">{event.title}</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Organizer: {organizerName(event)} {event.profiles?.email ? `(${event.profiles.email})` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created: {event.created_at ? new Date(event.created_at).toLocaleString() : 'Unknown'}
                </p>

                <div className="mt-3">
                  <StatusBadge status={event.status} />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Active Event: {isLiveEventStatus(event.status) ? 'Yes' : 'No'}
                </p>
              </div>

              <div className="text-left md:text-right space-y-3 md:min-w-[220px]">
                <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3 md:grid-cols-1">
                  <p className="font-semibold text-yellow-400">Revenue: GHS {Number(event.total_revenue || 0).toFixed(2)}</p>
                  <p className="text-muted-foreground">Withdrawn: GHS {Number(event.total_withdrawn || 0).toFixed(2)}</p>
                  <p className="font-semibold text-emerald-400">Available: GHS {Number(event.available_withdrawal_balance || 0).toFixed(2)}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:flex gap-2 md:justify-end">
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
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (isLiveEventStatus(status)) {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">LIVE</span>
  }

  if (status === "cancelled") {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-yellow-500/20 text-yellow-300 border-yellow-500/30">SUSPENDED</span>
  }

  return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-white/10 text-foreground/70 border-white/20 uppercase">{status || "unknown"}</span>
}