"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"

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
    return <div className="p-8 text-white">Loading events...</div>
  }

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold mb-6">All Events</h1>

      <div className="space-y-4">
        {events.map(event => (
          <div
            key={event.id}
            className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl"
          >
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold text-lg">{event.title}</h3>

                <p className="text-sm text-neutral-400">
                  Organizer: {event.profiles?.first_name} {event.profiles?.last_name}
                </p>

                <p className="text-sm text-neutral-400">
                  Status: {event.status}
                </p>
              </div>

              <div className="text-right space-y-3">
                <div className="text-yellow-400 font-bold">
                  GHS {event.total_revenue || 0}
                </div>

                <div className="flex gap-2 flex-wrap justify-end">
                  <Link
                    href={`/organizer/events/${event.id}`}
                    className="px-3 py-1 text-xs bg-blue-600 rounded"
                  >
                    Manage
                  </Link>

                  {event.status === "active" && (
                    <button
                      onClick={() => suspendEvent(event.id)}
                      disabled={processingId === event.id}
                      className="px-3 py-1 text-xs bg-yellow-600 rounded"
                    >
                      Suspend
                    </button>
                  )}

                  {event.status === "suspended" && (
                    <button
                      onClick={() => unsuspendEvent(event.id)}
                      disabled={processingId === event.id}
                      className="px-3 py-1 text-xs bg-green-600 rounded"
                    >
                      Unsuspend
                    </button>
                  )}

                  <button
                    onClick={() => deleteEvent(event.id)}
                    disabled={processingId === event.id}
                    className="px-3 py-1 text-xs bg-red-600 rounded"
                  >
                    Delete
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