'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import {
  Trophy,
  FolderPlus,
  BarChart3,
  CreditCard,
  Ticket,
  FileText,
  Pencil,
  ArrowLeft,
  CalendarClock,
  Play,
  Pause,
} from 'lucide-react'

export default function EventDashboardPage() {
  const params = useParams()
  const rawId = params?.eventId
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const router = useRouter()

  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [origin, setOrigin] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    if (!id) return

    const init = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      console.log('Logged in user:', user?.email)

      if (!user) {
        router.push('/auth/sign-in')
        return
      }

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('organizer_id', user.id)
        .maybeSingle()

      setEvent(data ?? null)
      setLoading(false)
    }

    init()
  }, [id, router])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-40 rounded-3xl bg-[hsl(var(--legacy-bg-card))] animate-pulse" />
      </div>
    )
  }

  const updateEventStatus = async (nextStatus: 'active' | 'pending') => {
    if (!id) return

    setSavingStatus(true)

    const response = await fetch('/api/organizer/update-event-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId: id, status: nextStatus }),
    })

    const result = await response.json().catch(() => ({}))

    if (response.ok) {
      if (result.data) setEvent(result.data)
      toast({
        title: nextStatus === 'active' ? 'Voting Opened' : 'Voting Closed',
        description: nextStatus === 'active'
          ? 'Voting is now open for this event.'
          : 'Voting has been closed. The event remains published publicly.',
      })
    } else {
      toast({
        title: 'Status update failed',
        description: result?.error || 'Could not update event status. Please try again.',
        variant: 'destructive',
      })
    }

    setSavingStatus(false)
  }

  if (!event) {
    return (
      <div className="p-12 text-red-500">
        Event not found or access denied
      </div>
    )
  }

  const publicCode = event.short_code || event.event_code || event.id

  return (
    <div className="flex-1 p-4 md:p-8 lg:p-12 space-y-8 md:space-y-12">

      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => router.push('/organizer')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-6"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            {event.title}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            {event.description}
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-foreground/70">
            <div className="rounded-2xl border border-border bg-[hsl(var(--legacy-bg-card))] px-4 py-3">
              <p className="text-muted-foreground text-xs mb-1">Voting Starts</p>
              <p>
                {event.start_date
                  ? new Date(event.start_date).toLocaleString()
                  : 'Not set'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-[hsl(var(--legacy-bg-card))] px-4 py-3">
              <p className="text-muted-foreground text-xs mb-1">Voting Ends</p>
              <p>
                {event.end_date
                  ? new Date(event.end_date).toLocaleString()
                  : 'Not set'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full lg:w-auto">
          <button
            onClick={() =>
              router.push(`/organizer/events/${id}/edit`)
            }
            className="min-h-11 px-5 py-3 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-black font-semibold"
          >
            <span className="flex items-center justify-center gap-2">
              <Pencil size={16} />
              Edit Event
            </span>
          </button>

          <button
            onClick={() => updateEventStatus('active')}
            disabled={savingStatus || event.status === 'active'}
            className="min-h-11 px-5 py-3 rounded-2xl border border-emerald-400 bg-emerald-100 text-emerald-700 font-semibold hover:bg-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <span className="flex items-center justify-center gap-2">
              <Play size={16} />
              {savingStatus ? 'Updating…' : 'Open Voting'}
            </span>
          </button>

          <button
            onClick={() => updateEventStatus('pending')}
            disabled={savingStatus || event.status === 'pending'}
            className="min-h-11 px-5 py-3 rounded-2xl border border-orange-400 bg-orange-100 text-orange-700 font-semibold hover:bg-orange-200 dark:border-orange-500/30 dark:bg-orange-500/20 dark:text-orange-300 dark:hover:bg-orange-500/30 disabled:opacity-50"
          >
            <span className="flex items-center justify-center gap-2">
              <Pause size={16} />
              {savingStatus ? 'Updating…' : 'Close Voting'}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          title="Status"
          value={event.status === 'pending' ? 'PUBLISHED' : String(event.status || 'active').toUpperCase()}
          icon={CalendarClock}
        />
        <InfoCard title="Event Code" value={publicCode || 'Not published'} icon={FileText} />
        <InfoCard title="Revenue" value={`GHS ${Number(event.total_revenue || 0).toFixed(2)}`} icon={CreditCard} />
      </div>

      {publicCode && origin && (
        <div className="rounded-2xl border border-border bg-[hsl(var(--legacy-bg-card))] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Public Event Link</p>
            <p className="text-foreground font-medium break-all">{`${origin}/events/${publicCode}`}</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`${origin}/events/${publicCode}`)}
            className="px-4 py-2 rounded-xl bg-[hsl(var(--gold))] text-black font-semibold"
          >
            Copy Link
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        <MenuCard title="Categories" icon={FolderPlus} path={`/organizer/events/${id}/categories`} />
        <MenuCard title="Nominees" icon={Trophy} path={`/organizer/events/${id}/nominees`} />
        <MenuCard title="Votes" icon={BarChart3} path={`/organizer/events/${id}/votes`} />
        <MenuCard title="Tickets" icon={Ticket} path={`/organizer/events/${id}/tickets`} />
        <MenuCard title="Results" icon={FileText} path={`/organizer/events/${id}/results`} />
        <MenuCard title="Withdrawals" icon={CreditCard} path={`/organizer/events/${id}/withdraw`} />
      </div>
    </div>
  )
}

function InfoCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: any
}) {
  return (
    <div className="rounded-2xl p-4 bg-[hsl(var(--legacy-bg-card))] border border-border">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
        <Icon size={14} />
        {title}
      </div>
      <p className="text-base md:text-lg font-semibold text-foreground break-words">{value}</p>
    </div>
  )
}

function MenuCard({
  title,
  icon: Icon,
  path,
}: {
  title: string
  icon: any
  path: string
}) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(path)}
      className="group rounded-3xl p-8 text-left bg-[hsl(var(--legacy-bg-card))] border border-border/70 text-foreground hover:border-[hsl(var(--gold))]/30 transition-all"
    >
      <div className="flex items-center gap-4 mb-4">
        <Icon size={26} className="text-[hsl(var(--gold))]" />
        <h3 className="text-lg font-semibold">
          {title}
        </h3>
      </div>

      <p className="text-muted-foreground text-sm">
        Manage {title.toLowerCase()} for this event.
      </p>
    </button>
  )
}