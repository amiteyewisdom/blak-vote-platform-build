'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Settings, Edit } from 'lucide-react'

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
      .order('created_at', { ascending: false })

    if (!error) {
      setEvents(data ?? [])
    }

    setLoading(false)
  }

  const totalRevenue = events.reduce(
    (sum, e) => sum + (e.total_revenue || 0),
    0
  )

  if (loading) {
    return (
      <div className="p-10">
        <div className="h-40 rounded-3xl bg-[#11131D] animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 md:p-12 space-y-14 bg-black min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold text-white">
            Organizer Dashboard
          </h1>
          <p className="text-white/40 mt-2">
            Manage your events and revenue
          </p>
        </div>

        <button
          onClick={() => router.push('/organizer/create-event')}
          className="px-8 py-4 rounded-2xl font-semibold bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black shadow-[0_0_35px_rgba(245,192,68,0.4)] hover:scale-105 transition-all"
        >
          Create Event
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <MetricCard title="Total Revenue" value={`GHS ${totalRevenue.toFixed(2)}`} />
        <MetricCard title="Total Events" value={events.length.toString()} />
        <MetricCard
          title="Live Events"
          value={events.filter((e) => e.status === 'published').length.toString()}
        />
      </div>

      {/* Event Cards */}
      <div className="grid sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-3xl bg-[#121421] border border-white/5 overflow-hidden transition-all duration-300 hover:border-[#F5C044]/30 hover:shadow-[0_30px_80px_rgba(0,0,0,0.7)] group"
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

            <div className="p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {event.title}
                  </h3>
                  <p className="text-white/40 text-sm mt-1 line-clamp-2">
                    {event.description}
                  </p>
                </div>

                <StatusBadge status={event.status} />
              </div>

              <div>
                <div className="text-white/40 text-sm mb-1">
                  Revenue
                </div>
                <div className="text-2xl font-bold text-white">
                  GHS {event.total_revenue || 0}
                </div>
              </div>

              {/* 🔥 ACTION BUTTONS ADDED BACK */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => router.push(`/organizer/events/${event.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:border-[#F5C044]/40 transition-all"
                >
                  <Settings className="w-4 h-4" />
                  Manage
                </button>

                <button
                  onClick={() => router.push(`/organizer/events/${event.id}/edit`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:border-[#F5C044]/40 transition-all"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-[#121421] border border-white/5 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="text-white/40 text-sm mb-2">{title}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'published')
    return (
      <span className="px-4 py-1 rounded-full text-xs font-semibold bg-[#F5C044] text-black">
        LIVE
      </span>
    )

  if (status === 'closed')
    return (
      <span className="px-4 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/50">
        CLOSED
      </span>
    )

  return (
    <span className="px-4 py-1 rounded-full text-xs font-semibold bg-white/5 text-[#F5C044] border border-[#F5C044]/30">
      DRAFT
    </span>
  )
}