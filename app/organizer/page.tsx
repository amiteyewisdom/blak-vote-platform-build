'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isLiveEventStatus } from '@/lib/event-status'
import { Settings, Edit, Clock } from 'lucide-react'

interface VotingEvent {
  id: string
  title: string
  description: string
  status: string
  total_revenue: number
  revenue_left: number
  cashed_out_amount: number
  start_date: string
  end_date: string
  image_url?: string
  is_active?: boolean
}

export default function OrganizerDashboard() {
  const router = useRouter()
  const [events, setEvents] = useState<VotingEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/organizer/dashboard', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (response.status === 401) {
        router.push('/auth/login')
        return
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load organizer dashboard')
      }

      setEvents(Array.isArray(payload?.events) ? payload.events : [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const publishEvent = async (eventId: string) => {
    const response = await fetch('/api/organizer/publish-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      alert('Failed to publish event: ' + (payload?.error || 'Unknown error'))
      return
    }

    alert('Event published successfully!')
    fetchEvents()
  }

  if (loading) {
    return (
      <div className="p-10">
        <div className="h-40 rounded-3xl bg-[hsl(var(--legacy-bg-surface))] animate-pulse" />
      </div>
    )
  }

  const totalRevenue = events.reduce(
    (sum, e) => sum + (e.total_revenue || 0),
    0
  )

  return (
    <div className="min-h-screen flex-1 space-y-6 bg-background p-3 sm:p-4 md:space-y-10 md:p-8 lg:p-10">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border/60 pb-6 md:flex-row md:items-center md:gap-8 md:pb-8">
        <div className="flex-1">
          <h1 className="mb-2 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl">
            Organizer Dashboard
          </h1>
          <p className="text-sm text-foreground/50 md:text-base">
            Manage your events, track revenue, and view live voting statistics
          </p>
        </div>

        <button
          onClick={() => router.push('/organizer/create-event')}
          className="w-full whitespace-nowrap rounded-xl bg-gradient-to-br from-gold to-gold-deep px-5 py-3 font-semibold text-gold-foreground shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-[hsl(var(--gold))]/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black md:w-auto md:px-6"
        >
          + Create Event
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
        <MetricCard title="Total Revenue" value={`GHS ${totalRevenue.toFixed(2)}`} />
        <MetricCard title="Total Events" value={events.length.toString()} />
        <MetricCard title="Live Events" value={events.filter((e) => isLiveEventStatus(e.status)).length.toString()} />
      </div>

      {/* Empty State */}
      {events.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white/2 p-8 text-center sm:p-12 md:p-16">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--gold))]/15 flex items-center justify-center">
              <span className="text-3xl">📋</span>
            </div>
          </div>
          <h3 className="mb-3 text-xl font-bold text-foreground sm:text-2xl">No Events Yet</h3>
          <p className="text-foreground/60 mb-8 max-w-md mx-auto leading-relaxed">
            Create your first voting event to start collecting votes, tracking revenue, and engaging your audience.
          </p>
          <button
            onClick={() => router.push('/organizer/create-event')}
            className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-br from-gold to-gold-deep text-gold-foreground hover:brightness-110 active:scale-[0.97] transition-all duration-200 shadow-lg"
          >
            Create Your First Event
          </button>
        </div>
      )}

      {/* Event Cards Grid */}
      {events.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground sm:mb-6">
            <span>Your Events</span>
            <span className="text-sm font-semibold text-foreground/50 bg-white/5 px-3 py-1 rounded-full">{events.length}</span>
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {events.map((event, idx) => (
          <div
            key={event.id}
            className="rounded-2xl bg-surface-card border border-border/60 overflow-hidden transition-all duration-300 hover:border-gold/40 hover:shadow-[0_20px_60px_hsl(var(--gold)/0.1)] group"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {event.image_url && (
              <div className="relative h-44 w-full overflow-hidden sm:h-52 md:h-60">
                <img
                  src={event.image_url}
                  alt={event.title || 'Event image'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              </div>
            )}

<div className="space-y-4 p-4 md:space-y-6 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-foreground truncate">
                    {event.title}
                  </h3>
                  <p className="text-foreground/50 text-sm mt-2 line-clamp-2 leading-relaxed">
                    {event.description}
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <StatusBadge status={event.status} />
                </div>
              </div>

              <div className="rounded-lg border border-white/8 bg-white/5 p-3 sm:p-4 space-y-2.5">
                <div>
                  <div className="text-foreground/50 text-[11px] font-semibold uppercase tracking-wider mb-1">Total Revenue</div>
                  <div className="text-lg font-bold text-gold">
                    GHS {Number(event.total_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-foreground/50 text-[11px] font-semibold uppercase tracking-wider mb-1">Revenue Left</div>
                  <div className="text-base font-semibold text-emerald-300">
                    GHS {Number(event.revenue_left || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-foreground/50 text-[11px] font-semibold uppercase tracking-wider mb-1">Cashed Out</div>
                  <div className="text-base font-semibold text-orange-300">
                    GHS {Number(event.cashed_out_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-foreground/40 text-xs pt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'No date'}
                    {event.end_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-2 pt-2 border-t border-border/60 sm:grid-cols-3 sm:gap-2.5">
                <button
                  onClick={() => router.push(`/organizer/events/${event.id}`)}
                  className="min-h-11 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-border text-foreground hover:border-gold/40 transition-all"
                >
                  <Settings className="w-4 h-4" />
                  Manage
                </button>

                <button
                  onClick={() => router.push(`/organizer/events/${event.id}/edit`)}
                  className="min-h-11 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-border text-foreground hover:border-gold/40 transition-all"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>

                {!isLiveEventStatus(event.status) && event.status !== 'completed' && (
                  <button
                    onClick={() => publishEvent(event.id)}
                    className="min-h-11 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[hsl(var(--gold))] text-gold-foreground font-semibold hover:opacity-90 transition-all"
                  >
                    Publish
                  </button>
                )}
              </div>
            </div>
          </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-surface-elevated p-5 shadow-[0_2px_12px_hsl(var(--foreground)/0.35)] sm:p-6">
      <p className="text-xs uppercase tracking-widest font-medium text-foreground/40">{title}</p>
      <div className="text-2xl font-bold leading-none text-foreground sm:text-3xl">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending')
    return (
      <span className="px-4 py-1 rounded-full text-xs font-semibold bg-[hsl(var(--gold))] text-gold-foreground">
        PUBLISHED
      </span>
    )

  if (isLiveEventStatus(status))
    return (
      <span className="px-4 py-1 rounded-full text-xs font-semibold bg-[hsl(var(--gold))] text-gold-foreground">
        LIVE
      </span>
    )

  if (status === 'completed' || status === 'closed')
    return (
      <span className="px-4 py-1 rounded-full text-xs font-semibold bg-white/10 text-foreground/50">
        CLOSED
      </span>
    )

  return (
    <span className="px-4 py-1 rounded-full text-xs font-semibold bg-white/5 text-gold border border-gold/30 uppercase">
      {status || 'pending'}
    </span>
  )
}
