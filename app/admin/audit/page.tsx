'use client'

import { useEffect, useState } from 'react'
import { DSSelect } from '@/components/ui/design-system'

interface EventOption {
  id: string
  title: string
  status: string | null
  created_at: string
  organizer_name: string
}

interface NomineeOption {
  nominee_id: string
  nominee_name: string
  category_name?: string | null
}

interface AuditLogEntry {
  id: number
  vote_id: string
  candidate_id: string | null
  voter_id: string | null
  voter_phone: string | null
  vote_type: 'free' | 'paid' | 'manual'
  is_manual: boolean
  quantity: number | null
  vote_source: string | null
  payment_method: string | null
  transaction_id: string | null
  added_by_user_id: string | null
  added_by_name: string | null
  added_by_email: string | null
  manual_entry_mode: string | null
  occurred_at: string
  logged_at: string
}

export default function AdminAuditPage() {
  const [events, setEvents] = useState<EventOption[]>([])
  const [nominees, setNominees] = useState<NomineeOption[]>([])
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [selectedOrganizer, setSelectedOrganizer] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedNomineeId, setSelectedNomineeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'free' | 'paid' | 'manual'>('all')

  useEffect(() => {
    void loadEvents()
  }, [])

  useEffect(() => {
    setSelectedEventId('')
    setSelectedCategory('')
    setSelectedNomineeId('')
  }, [selectedOrganizer])

  useEffect(() => {
    if (!selectedEventId) {
      setLogs([])
      setNominees([])
      return
    }

    void Promise.all([loadAuditLogs(selectedEventId), loadNominees(selectedEventId)])
  }, [selectedEventId])

  async function loadEvents() {
    setLoading(true)

    try {
      const res = await fetch('/api/admin/events', { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('Failed to load events', payload?.error)
        setLoading(false)
        return
      }

      const eventRows: EventOption[] = (payload.events ?? []).map((e: any) => {
        const organizerName = `${e.profiles?.first_name || ''} ${e.profiles?.last_name || ''}`.trim()
          || e.profiles?.email
          || 'Unknown organizer'
        return {
          id: String(e.id),
          title: String(e.title ?? e.id),
          status: e.status ?? null,
          created_at: e.created_at ?? '',
          organizer_name: organizerName,
        }
      })

      setEvents(eventRows)

      if (eventRows[0]?.id) {
        setSelectedEventId(eventRows[0].id)
      }
    } catch (err) {
      console.error('Failed to load events', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadNominees(eventId: string) {
    try {
      const res = await fetch(`/api/nominations/by-event?event_id=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('Failed to load nominees', payload?.error)
        return
      }

      setNominees(payload.nominees ?? [])
      setSelectedCategory('')
      setSelectedNomineeId('')
    } catch (err) {
      console.error('Failed to load nominees', err)
    }
  }

  async function loadAuditLogs(eventId: string) {
    setLogsLoading(true)

    const response = await fetch(`/api/votes/audit?eventId=${encodeURIComponent(eventId)}&limit=500`)

    if (!response.ok) {
      console.error('Failed to load audit logs')
      setLogs([])
      setLogsLoading(false)
      return
    }

    const payload = await response.json()
    setLogs(payload.logs ?? [])
    setLogsLoading(false)
  }

  const organizers = Array.from(new Set(events.map((event) => event.organizer_name))).sort()
  const availableEvents = selectedOrganizer
    ? events.filter((event) => event.organizer_name === selectedOrganizer)
    : events
  const categories = Array.from(new Set(nominees.map((nominee) => nominee.category_name).filter((name): name is string => Boolean(name)))).sort()
  const filteredNominees = selectedCategory
    ? nominees.filter((nominee) => nominee.category_name === selectedCategory)
    : nominees

  const filteredLogs = logs.filter((log) => {
    if (selectedType !== 'all' && log.vote_type !== selectedType) return false
    if (selectedNomineeId && log.candidate_id !== selectedNomineeId) return false

    const nominee = nominees.find((item) => item.nominee_id === log.candidate_id)
    if (selectedCategory && nominee?.category_name !== selectedCategory) return false

    const occurredAt = new Date(log.occurred_at)
    if (Number.isNaN(occurredAt.getTime())) return false
    const dateOnly = occurredAt.toISOString().slice(0, 10)
    const timeOnly = occurredAt.toTimeString().slice(0, 5)
    if (startDate && dateOnly < startDate) return false
    if (endDate && dateOnly > endDate) return false
    if (startTime && timeOnly < startTime) return false
    if (endTime && timeOnly > endTime) return false
    return true
  })

  const totalVotes = filteredLogs.reduce((sum, log) => sum + Number(log.quantity ?? 1), 0)
  const manualVotes = filteredLogs
    .filter((log) => log.vote_type === 'manual')
    .reduce((sum, log) => sum + Number(log.quantity ?? 1), 0)
  const paidVotes = filteredLogs
    .filter((log) => log.vote_type === 'paid')
    .reduce((sum, log) => sum + Number(log.quantity ?? 1), 0)

  function getNomineeName(candidateId: string | null) {
    if (!candidateId) {
      return 'Unknown candidate'
    }

    return nominees.find((n) => n.nominee_id === candidateId)?.nominee_name || candidateId
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 text-foreground md:p-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Vote Audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review immutable vote logs across all events, including manual vote attribution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-4">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Organizer</label>
              <DSSelect value={selectedOrganizer} onChange={(event) => setSelectedOrganizer(event.target.value)} className="w-full">
                <option value="">All organizers</option>
                {organizers.map((organizer) => <option key={organizer} value={organizer}>{organizer}</option>)}
              </DSSelect>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Event</label>
              <DSSelect value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} className="w-full">
                <option value="">Select an event</option>
                {availableEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.title} {event.status ? `(${event.status})` : ''}</option>
                ))}
              </DSSelect>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Category</label>
              <DSSelect value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="w-full" disabled={!selectedEventId}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </DSSelect>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Nominee</label>
              <DSSelect value={selectedNomineeId} onChange={(event) => setSelectedNomineeId(event.target.value)} className="w-full" disabled={!selectedEventId}>
                <option value="">All nominees</option>
                {filteredNominees.map((nominee) => <option key={nominee.nominee_id} value={nominee.nominee_id}>{nominee.nominee_name}</option>)}
              </DSSelect>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">From date</label>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm" disabled={!selectedEventId} />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">To date</label>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm" disabled={!selectedEventId} />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">From time</label>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm" disabled={!selectedEventId} />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">To time</label>
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm" disabled={!selectedEventId} />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Filter</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'free', 'paid', 'manual'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium ${
                    selectedType === type
                      ? 'border-gold bg-gold text-gold-foreground'
                      : 'border-border text-foreground/70 hover:bg-muted/60'
                  }`}
                >
                  {type === 'all' ? 'All Votes' : `${type[0].toUpperCase()}${type.slice(1)} Votes`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <MetricCard title="Audit Rows" value={String(filteredLogs.length)} />
          <MetricCard title="Votes Logged" value={String(totalVotes)} />
          <MetricCard title="Manual Votes" value={String(manualVotes)} />
          <MetricCard title="Paid Votes" value={String(paidVotes)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-border bg-card">
        <table className="w-full text-left min-w-[1100px]">
          <thead className="border-b border-border text-sm text-muted-foreground">
            <tr>
              <th className="p-4">Candidate</th>
              <th className="p-4">Qty</th>
              <th className="p-4">Type</th>
              <th className="p-4">Voter</th>
              <th className="p-4">Source</th>
              <th className="p-4">Added By</th>
              <th className="p-4">Occurred</th>
              <th className="p-4">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {logsLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">Loading audit log...</td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">No audit entries found for this event.</td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const actorLabel = log.added_by_name || log.added_by_email || log.added_by_user_id || 'System'
                const voterLabel = log.voter_id || log.voter_phone || 'Guest / unknown'

                return (
                  <tr key={log.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="p-4">{getNomineeName(log.candidate_id)}</td>
                    <td className="p-4">{log.quantity ?? 1}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                        log.vote_type === 'manual'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : log.vote_type === 'paid'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {log.vote_type}
                        {log.manual_entry_mode ? ` / ${log.manual_entry_mode}` : ''}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-foreground/70">{voterLabel}</td>
                    <td className="p-4 text-sm text-foreground/70">
                      {[log.vote_source, log.payment_method].filter(Boolean).join(' / ') || 'n/a'}
                    </td>
                    <td className="p-4 text-sm text-foreground/70">{actorLabel}</td>
                    <td className="p-4 text-muted-foreground">{new Date(log.occurred_at).toLocaleString()}</td>
                    <td className="p-4 text-xs text-muted-foreground">{log.transaction_id || 'n/a'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-card p-5 shadow-[0_2px_12px_hsl(var(--foreground)/0.08)]">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="text-2xl font-bold leading-none text-foreground">{value}</div>
    </div>
  )
}