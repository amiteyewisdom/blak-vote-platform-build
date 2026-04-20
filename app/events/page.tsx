'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, Users, Vote, Clock } from 'lucide-react'
import PublicNav from '@/components/PublicNav'

interface Nominee {
  id: string
  name: string
  vote_count?: number
  photo_url?: string | null
  category_id?: string | null
  category_name?: string | null
}

interface EventWithNominees {
  event: any
  nominees: Nominee[]
}

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [eventNominees, setEventNominees] = useState<EventWithNominees[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    const res = await fetch('/api/events/public')
    const payload = await res.json()

    if (res.ok) {
      const list: EventWithNominees[] = payload.eventNominees || []
      setEventNominees(list)
      setEvents(list.map((entry) => entry.event))
    }

    setLoading(false)
  }

  const filteredEvents = events.filter(event => {
    const title = String(event.title || '').toLowerCase()
    const description = String(event.description || '').toLowerCase()
    const query = searchTerm.toLowerCase()

    return title.includes(query) || description.includes(query)
  })

  const nowTs = Date.now()
  const summary = filteredEvents.reduce(
    (acc, event) => {
      const startTs = event.start_date ? new Date(event.start_date).getTime() : NaN
      const endTs = event.end_date ? new Date(event.end_date).getTime() : NaN

      if (!Number.isNaN(startTs) && startTs > nowTs) {
        acc.upcoming += 1
      } else if (!Number.isNaN(endTs) && endTs < nowTs) {
        acc.closed += 1
      } else {
        acc.live += 1
      }

      return acc
    },
    { live: 0, upcoming: 0, closed: 0 }
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--legacy-bg-base))] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-border border-t-foreground/60 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-foreground/60">Loading events...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--legacy-bg-base))] text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.2),transparent_65%)] blur-3xl" />
        <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.16),transparent_68%)] blur-3xl" />
        <div className="absolute bottom-8 -right-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.14),transparent_68%)] blur-3xl" />
      </div>

      <PublicNav />
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="max-w-3xl rounded-2xl border border-border bg-card/90 px-5 py-6 shadow-[0_12px_28px_hsl(var(--foreground)/0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.75),rgba(15,23,42,0.45))] dark:shadow-[0_20px_50px_rgba(2,6,23,0.35)] sm:px-7 sm:py-7">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/85">Discover</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-foreground dark:bg-gradient-to-r dark:from-white dark:via-slate-100 dark:to-gold dark:bg-clip-text dark:text-transparent">Public Events</h1>
          <p className="mt-3 text-sm sm:text-base text-foreground/60 leading-relaxed">
            Browse live and upcoming voting events.
          </p>
        </div>

        <div className="mt-8 max-w-xl rounded-xl border border-border bg-card/80 px-4 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/45">
          <input
            type="text"
            placeholder="Search events"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 px-1 bg-transparent border-b border-gold/25 text-foreground placeholder:text-foreground/45 text-sm sm:text-base focus:outline-none focus:border-gold/60"
          />
        </div>

        <div className="mt-5 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-200/90">Live</p>
            <p className="mt-1 text-base font-semibold text-emerald-800 dark:text-emerald-100">{summary.live}</p>
          </div>
          <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-sky-700 dark:text-sky-200/90">Upcoming</p>
            <p className="mt-1 text-base font-semibold text-sky-800 dark:text-sky-100">{summary.upcoming}</p>
          </div>
          <div className="rounded-lg border border-slate-400/35 bg-slate-400/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200/90">Closed</p>
            <p className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{summary.closed}</p>
          </div>
        </div>

        <div className="mt-10">
        {filteredEvents.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-xl sm:text-2xl font-semibold">No events found</h3>
            <p className="mt-2 text-foreground/60">Try another search term or check back later.</p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between pb-3.5 border-b border-gold/20">
              <h2 className="text-[15px] sm:text-base font-semibold tracking-[0.01em]">All Events</h2>
              <p className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs sm:text-sm text-sky-700 dark:text-sky-200">{filteredEvents.length} total</p>
            </div>

            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/90 shadow-[0_10px_26px_hsl(var(--foreground)/0.12)] dark:divide-white/10 dark:border-white/10 dark:bg-slate-950/45 dark:shadow-[0_14px_36px_rgba(2,6,23,0.28)]">
              {filteredEvents.map((event) => {
                const publicEventCode = event.short_code || event.event_code || event.id
                const nominees = eventNominees.find((en) => en.event.id === event.id)?.nominees || []
                const totalVotes = nominees.reduce((sum, nominee) => sum + Number(nominee.vote_count || 0), 0)
                const eventDate = event.start_date ? new Date(event.start_date) : null
                const eventDateLabel = eventDate ? eventDate.toLocaleDateString() : 'Date not set'
                const eventTimeLabel = eventDate ? eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time not set'
                const startTs = event.start_date ? new Date(event.start_date).getTime() : NaN
                const endTs = event.end_date ? new Date(event.end_date).getTime() : NaN

                const status = (!Number.isNaN(startTs) && startTs > nowTs)
                  ? { label: 'Upcoming', className: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-200' }
                  : (!Number.isNaN(endTs) && endTs < nowTs)
                    ? { label: 'Closed', className: 'border-slate-400/35 bg-slate-400/10 text-slate-700 dark:text-slate-300' }
                    : { label: 'Live', className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' }

                return (
                  <Link
                    key={event.id}
                    href={`/events/${publicEventCode}`}
                    className="no-transition block px-3 py-5 sm:px-4 sm:py-6"
                  >
                    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_11.5rem_6rem] sm:items-center sm:gap-6">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[15px] sm:text-[17px] font-semibold leading-tight tracking-[-0.01em] truncate">
                            {event.title || 'Untitled event'}
                          </h3>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[13px] sm:text-sm text-foreground/60 line-clamp-1 leading-relaxed">
                          {event.description || event.category || 'Public voting event'}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-[13px] text-foreground/55">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-foreground/45" />
                            {eventDateLabel}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-foreground/45" />
                            {eventTimeLabel}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end">
                        <div className="grid grid-cols-2 gap-6 text-right w-full sm:w-auto">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200/75">Votes</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums inline-flex items-center gap-1.5 justify-end min-w-[4.5rem] text-amber-700 dark:text-amber-100">
                              <Vote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300/90" />
                              {totalVotes.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-200/75">Candidates</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums inline-flex items-center gap-1.5 justify-end min-w-[4.5rem] text-emerald-700 dark:text-emerald-100">
                              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300/85" />
                              {nominees.length}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:justify-end">
                        <span className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium border border-gold/30 bg-gold/10 text-gold">
                          Open
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}
