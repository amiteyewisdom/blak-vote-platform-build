"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { isLiveEventStatus } from "@/lib/event-status"

export default function AdminEventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
   const { data } = await supabase
  .from("events")
  .select(`
    *,
    profiles:organizer_id (
      first_name,
      last_name,
      email
    )
  `)
  .neq("status", "deleted")
  .order("created_at", { ascending: false })

    if (data) setEvents(data)
    setLoading(false)
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

  if (loading) {
    return <div className="p-4 md:p-8 text-foreground">Loading events...</div>
  }

  return (
    <div className="p-4 md:p-8 text-foreground space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">All Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">Suspend, reactivate, or remove organizer events.</p>
      </div>

      {events.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface-card p-6 text-center text-muted-foreground md:p-8">
          No active events found.
        </div>
      )}

      <div className="space-y-4">
        {events.map(event => (
          <div
            key={event.id}
            className="rounded-2xl border border-border bg-card p-4 md:p-5"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">{event.title}</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Organizer: {event.profiles?.first_name} {event.profiles?.last_name} {event.profiles?.email ? `(${event.profiles.email})` : ""}
                </p>

                <div className="mt-3">
                  <StatusBadge status={event.status} />
                </div>
              </div>

              <div className="text-left md:text-right space-y-3 md:min-w-[220px]">
                <div className="text-yellow-400 font-bold text-lg">
                  GHS {Number(event.total_revenue || 0).toFixed(2)}
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