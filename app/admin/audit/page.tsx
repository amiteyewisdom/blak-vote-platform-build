'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { DSSelect } from '@/components/ui/design-system'

interface EventOption {
  id: string
  title: string
  status: string | null
  created_at: string
}

interface NomineeOption {
  id: string
  nominee_name: string
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
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'free' | 'paid' | 'manual'>('all')

  useEffect(() => {
    void loadEvents()
  }, [])

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

    const { data, error } = await supabase
      .from('events')
      .select('id, title, status, created_at')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load events', error)
      setLoading(false)
      return
    }

    const eventRows = data ?? []
    setEvents(eventRows)

    if (eventRows[0]?.id) {
      setSelectedEventId(eventRows[0].id)
    }

    setLoading(false)
  }

  async function loadNominees(eventId: string) {
    const { data, error } = await supabase
      .from('nominations')
      .select('id, nominee_name')
      .eq('event_id', eventId)
      .order('nominee_name', { ascending: true })

    if (error) {
      console.error('Failed to load nominees', error)
      return
    }

    setNominees(data ?? [])
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

  const filteredLogs = selectedType === 'all'
    ? logs
    : logs.filter((log) => log.vote_type === selectedType)

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

    return nominees.find((nominee) => nominee.id === candidateId)?.nominee_name || candidateId
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
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Event</label>
            <DSSelect
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className="w-full"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} {event.status ? `(${event.status})` : ''}
                </option>
              ))}
            </DSSelect>
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