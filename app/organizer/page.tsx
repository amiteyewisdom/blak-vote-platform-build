'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { isLiveEventStatus } from '@/lib/event-status'
import { Settings, Edit, Clock } from 'lucide-react'

interface VotingEvent {
  id: string
  title: string
  description: string
  status: string
  total_revenue: number
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/auth/sign-in')
      return
    }

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organizer_id', user.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })

    if (!error) {
      setEvents(data ?? [])
    }

    setLoading(false)
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
    <div className="flex-1 p-4 md:p-8 lg:p-12 space-y-10 md:space-y-14 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8 pb-8 border-b border-border/60">
        <div className="flex-1">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 leading-tight">
            Organizer Dashboard
          </h1>
          <p className="text-foreground/50 text-sm md:text-base">
            Manage your events, track revenue, and view live voting statistics
          </p>
        </div>

        <button
          onClick={() => router.push('/organizer/create-event')}
          className="w-full md:w-auto px-6 py-3 rounded-xl font-semibold bg-gradient-to-br from-gold to-gold-deep text-gold-foreground hover:brightness-110 active:scale-[0.97] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black shadow-lg hover:shadow-[hsl(var(--gold))]/30 whitespace-nowrap"
        >
          + Create Event
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <MetricCard title="Total Revenue" value={`GHS ${totalRevenue.toFixed(2)}`} />
        <MetricCard title="Total Events" value={events.length.toString()} />
        <MetricCard
          title="Live Events"
          value={events.filter((e) => isLiveEventStatus(e.status)).length.toString()}
        />
      </div>

      {/* Empty State */}
      {events.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white/2 p-12 md:p-16 text-center">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--gold))]/15 flex items-center justify-center">
              <span className="text-3xl">📋</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">No Events Yet</h3>
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
          <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
            <span>Your Events</span>
            <span className="text-sm font-semibold text-foreground/50 bg-white/5 px-3 py-1 rounded-full">{events.length}</span>
          </h2>

          <div className="grid sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {events.map((event, idx) => (
          <div
            key={event.id}
            className="rounded-2xl bg-surface-card border border-border/60 overflow-hidden transition-all duration-300 hover:border-gold/40 hover:shadow-[0_20px_60px_hsl(var(--gold)/0.1)] group"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {event.image_url && (
              <div className="relative h-60 w-full overflow-hidden">
                <img
                  src={event.image_url}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              </div>
            )}

<div className="p-5 md:p-6 space-y-5 md:space-y-6">
              <div className="flex items-start justify-between gap-4">
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

              <div className="bg-white/5 rounded-lg p-4 border border-white/8">
                <div className="text-foreground/50 text-xs font-semibold uppercase tracking-wider mb-2">
                  Total Revenue
                </div>
                <div className="text-3xl font-bold text-gold mb-3">
                  GHS {Number(event.total_revenue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
                <div className="flex items-center gap-1 text-foreground/40 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'No date'}
                    {event.end_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
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
    <div className="rounded-2xl bg-surface-elevated border border-white/[0.07] p-6 shadow-[0_2px_12px_hsl(var(--foreground)/0.35)] flex flex-col gap-3">
      <p className="text-xs uppercase tracking-widest font-medium text-foreground/40">{title}</p>
      <div className="text-3xl font-bold text-foreground leading-none">{value}</div>
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
