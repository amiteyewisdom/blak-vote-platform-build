'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Activity, ArrowLeft, Download, RefreshCw, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { buildCategoryGroups, type ResultCandidate, type ResultCategory } from '@/lib/results-utils'
import { useToast } from '@/hooks/use-toast'

type VoteRow = {
  candidate_id: string | null
  vote_type: 'free' | 'paid' | 'manual'
  quantity: number | null
  amount_paid: number | null
}

export default function ResultsPage() {
  const { toast } = useToast()
  const params = useParams()
  const eventId = String(params?.eventId || params?.id)
  const router = useRouter()

  const [eventTitle, setEventTitle] = useState('Results')
  const [categories, setCategories] = useState<ResultCategory[]>([])
  const [candidates, setCandidates] = useState<ResultCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [previousRankMap, setPreviousRankMap] = useState<Record<string, number>>({})
  const rankMapRef = useRef<Record<string, number>>({})
  const totalVotesRef = useRef(0)
  const initializedVotesRef = useRef(false)
  const notificationsEnabledRef = useRef(true)

  useEffect(() => {
    const loadNotificationSetting = async () => {
      const res = await fetch('/api/organizer/settings', { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))
      if (res.ok) {
        setNotificationsEnabled(payload.enable_notifications !== false)
      }
    }

    void loadNotificationSetting()
  }, [])

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled
  }, [notificationsEnabled])

  useEffect(() => {
    if (!eventId || eventId === 'undefined' || eventId === 'null') {
      return
    }

    void fetchData(false)

    const channel = supabase
      .channel(`organizer-results-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          if (autoRefresh) {
            void fetchData(true)
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [eventId, autoRefresh])

  useEffect(() => {
    if (!autoRefresh || !eventId) return

    const interval = window.setInterval(() => {
      void fetchData(true)
    }, 30000)

    return () => window.clearInterval(interval)
  }, [autoRefresh, eventId])

  const fetchVoteRows = async (): Promise<VoteRow[]> => {
    // Try different column combinations to identify what works
    const queries = [
      { columns: 'candidate_id, vote_type, quantity, amount_paid', name: 'Full' },
      { columns: 'candidate_id, vote_type, quantity', name: 'Without amount_paid' },
      { columns: 'candidate_id, vote_type', name: 'Basic' },
      { columns: 'id', name: 'ID only' },
    ]

    for (const query of queries) {
      try {
        const result = await supabase
          .from('votes')
          .select(query.columns)
          .eq('event_id', eventId)

        if (!result.error) {
          console.log(`✓ Votes query succeeded with columns: ${query.name}`, result.data?.length, 'rows')
          return ((result.data ?? []) as any[]).map((row) => ({
            candidate_id: row.candidate_id ?? null,
            vote_type: row.vote_type ?? 'free',
            quantity: row.quantity ? Math.max(1, Number(row.quantity)) : 1,
            amount_paid: row.amount_paid ? Number(row.amount_paid) : 0,
          }))
        }
        
        console.log(`✗ Votes query failed with columns: ${query.name}`, result.error)
      } catch (err) {
        console.error(`✗ Votes query exception with columns: ${query.name}`, err)
      }
    }

    // All queries failed, return empty array
    console.error('All votes queries failed - returning empty array')
    return []
  }

  const fetchData = async (silent: boolean) => {
    try {
      if (!silent) {
        setLoading(true)
      }

      setRefreshing(true)

      const res = await fetch(`/api/organizer/results?eventId=${eventId}`, {
        cache: 'no-store',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `Server error: ${res.status}`)
      }

      const data = await res.json()
      const eventResult = { data: data.event, error: null }
      const categoriesResult = { data: data.categories, error: null }
      const nominationsResult = { data: data.nominations, error: null }
      const voteRows = (data.votes ?? []) as VoteRow[]

      console.log('Results data fetched:', {
        event: eventResult.data?.title,
        categories: categoriesResult.data?.length,
        nominations: nominationsResult.data?.length,
        votes: voteRows.length,
      })
      // Check for critical errors
      if (eventResult.error) {
        console.error('Event fetch error:', {
          message: eventResult.error?.message,
          details: eventResult.error?.details,
          hint: eventResult.error?.hint,
        })
      } else {
        console.log('Event fetched successfully:', eventResult.data)
      }
      
      if (categoriesResult.error) {
        console.error('Categories fetch error:', {
          message: categoriesResult.error?.message,
          details: categoriesResult.error?.details,
        })
      } else {
        console.log('Categories fetched successfully:', categoriesResult.data?.length, 'items')
      }
      
      if (nominationsResult.error) {
        console.error('Nominations fetch error:', {
          message: nominationsResult.error?.message,
          details: nominationsResult.error?.details,
        })
      } else {
        console.log('Nominations fetched successfully:', nominationsResult.data?.length, 'items')
      }
      
      console.log('Vote rows fetched:', voteRows.length, 'items')

      if (eventResult.data?.title) {
        setEventTitle(eventResult.data.title)
      }

    setCategories((categoriesResult.data ?? []) as ResultCategory[])

    const breakdownMap = new Map<
      string,
      { paidVotes: number; manualVotes: number; paidRevenue: number; totalVotesFromRows: number }
    >()

    for (const row of voteRows) {
      const candidateId = row.candidate_id
      if (!candidateId) continue

      const quantity = Math.max(1, Number(row.quantity || 1))
      const amountPaid = Number(row.amount_paid || 0)
      const current = breakdownMap.get(candidateId) ?? {
        paidVotes: 0,
        manualVotes: 0,
        paidRevenue: 0,
        totalVotesFromRows: 0,
      }

      current.totalVotesFromRows += quantity

      if (row.vote_type === 'paid') {
        current.paidVotes += quantity
        current.paidRevenue += amountPaid
      }

      if (row.vote_type === 'manual') {
        current.manualVotes += quantity
      }

      breakdownMap.set(candidateId, current)
    }

    const mergedCandidates: ResultCandidate[] = ((nominationsResult.data ?? []) as any[]).map((candidate) => {
      const breakdown = breakdownMap.get(String(candidate.id)) ?? {
        paidVotes: 0,
        manualVotes: 0,
        paidRevenue: 0,
        totalVotesFromRows: 0,
      }

      const nominationTotalVotes = Number(candidate.vote_count || 0)
      const totalVotes = Math.max(nominationTotalVotes, breakdown.totalVotesFromRows)

      return {
        id: String(candidate.id),
        name: String(candidate.nominee_name || 'Unknown candidate'),
        photoUrl: candidate.photo_url || null,
        categoryId: candidate.category_id || null,
        totalVotes,
        paidVotes: breakdown.paidVotes,
        manualVotes: breakdown.manualVotes,
        revenue: Number(breakdown.paidRevenue.toFixed(2)),
      }
    })

    const nextGroups = buildCategoryGroups((categoriesResult.data ?? []) as ResultCategory[], mergedCandidates)
    const nextRankMap = nextGroups.reduce<Record<string, number>>((acc, group) => {
      for (const candidate of group.candidates) {
        acc[candidate.id] = candidate.rank
      }
      return acc
    }, {})

    setPreviousRankMap(rankMapRef.current)
    rankMapRef.current = nextRankMap

    const currentTotalVotes = mergedCandidates.reduce((sum, candidate) => sum + Number(candidate.totalVotes || 0), 0)
    if (initializedVotesRef.current && notificationsEnabledRef.current) {
      const delta = currentTotalVotes - totalVotesRef.current
      if (delta > 0) {
        toast({
          title: 'New voting activity',
          description: `${delta} new vote${delta === 1 ? '' : 's'} recorded for this event.`,
        })
      }
    }
    totalVotesRef.current = currentTotalVotes
    initializedVotesRef.current = true

    setCandidates(mergedCandidates)
    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
    } catch (error) {
      console.error('Error fetching results data:', error)
      setLoading(false)
      setRefreshing(false)
    }
  }

  const groups = useMemo(() => buildCategoryGroups(categories, candidates), [categories, candidates])

  const summary = useMemo(() => {
    return candidates.reduce(
      (acc, candidate) => {
        const paidVotes = Number(candidate.paidVotes || 0)
        const manualVotes = Number(candidate.manualVotes || 0)
        const totalVotes = Number(candidate.totalVotes || 0)
        const revenue = Number(candidate.revenue || 0)

        acc.totalVotes += totalVotes
        acc.paidVotes += paidVotes
        acc.manualVotes += manualVotes
        acc.totalRevenue += revenue
        return acc
      },
      {
        totalVotes: 0,
        paidVotes: 0,
        manualVotes: 0,
        totalRevenue: 0,
      }
    )
  }, [candidates])

  const hasManualVotes = summary.manualVotes > 0

  const exportCsv = () => {
    const rows: string[] = ['Category,Candidate,Rank,Total Votes,Paid Votes,Manual Votes,Paid Revenue (GHS)']

    for (const group of groups) {
      for (const candidate of group.candidates) {
        rows.push(
          [
            group.name,
            candidate.name,
            String(candidate.rank),
            String(candidate.totalVotes),
            String(candidate.paidVotes || 0),
            String(candidate.manualVotes || 0),
            String(Number(candidate.revenue || 0).toFixed(2)),
          ]
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(',')
        )
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `results-${eventId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!eventId || eventId === 'undefined' || eventId === 'null') {
    return (
      <div className="p-12">
        <div className="rounded-3xl border border-border bg-card p-6 text-center">
          <p className="text-red-500 font-semibold">Error: Event not found</p>
          <p className="text-muted-foreground mt-2">Unable to load results for this event. Please go back and try again.</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 rounded-lg bg-[hsl(var(--gold))] text-black font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-64 rounded-3xl bg-surface-card animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold flex items-center gap-3">
            <Trophy className="text-[hsl(var(--gold))]" size={30} />
            {eventTitle}
          </h1>
          <p className="text-muted-foreground mt-2">Organizer results dashboard</p>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-emerald-300">
              <Activity size={14} />
              Live updates
            </span>
            {hasManualVotes && (
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-300">
                Manual votes included
              </span>
            )}
            <span className="text-muted-foreground">
              Last updated: {lastUpdated ? lastUpdated.toLocaleString() : '--'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`rounded-xl border px-4 py-2 text-sm transition ${
              autoRefresh
                ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                : 'border-border bg-surface text-foreground'
            }`}
          >
            Auto refresh: {autoRefresh ? 'On' : 'Off'}
          </button>

          <button
            onClick={() => void fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm transition hover:bg-surface/80 disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm transition hover:bg-surface/80"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Votes" value={summary.totalVotes.toLocaleString()} />
        <StatCard title="Paid Votes" value={summary.paidVotes.toLocaleString()} />
        <StatCard title="Manual Votes" value={summary.manualVotes.toLocaleString()} />
        <StatCard title="Paid Revenue" value={`GHS ${summary.totalRevenue.toFixed(2)}`} />
      </div>

      {summary.totalVotes === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-14 text-center">
          <h2 className="text-xl font-semibold text-foreground">No votes yet</h2>
          <p className="mt-2 text-muted-foreground">As votes come in, rankings and revenue will update here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.id} className="rounded-3xl border border-border bg-card p-6 md:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-[hsl(var(--gold))]">{group.name}</h2>
                <span className="text-sm text-muted-foreground">{group.candidates.length} candidates</span>
              </div>

              {group.candidates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">No votes yet</p>
              ) : (
                <div className="space-y-4">
                  {group.candidates.map((candidate) => (
                    <article
                      key={candidate.id}
                      className={`rounded-2xl border p-4 ${candidate.rank <= 3 ? 'border-gold/45 bg-gold/5' : 'border-border bg-surface'}`}
                    >
                      {(() => {
                        const previousRank = previousRankMap[candidate.id]
                        const hasPrevious = typeof previousRank === 'number'
                        const movement = hasPrevious ? previousRank - candidate.rank : 0

                        return (
                          <div className="mb-2 flex items-center justify-end text-xs">
                            {!hasPrevious ? (
                              <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">new</span>
                            ) : movement > 0 ? (
                              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-emerald-300">
                                ↑ {movement}
                              </span>
                            ) : movement < 0 ? (
                              <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2 py-1 text-red-300">
                                ↓ {Math.abs(movement)}
                              </span>
                            ) : (
                              <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">no change</span>
                            )}
                          </div>
                        )
                      })()}

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="w-12 text-center text-lg font-bold text-muted-foreground">
                            {candidate.medal ? `${candidate.medal} #${candidate.rank}` : `#${candidate.rank}`}
                          </div>

                          <div className="h-12 w-12 overflow-hidden rounded-xl border border-border bg-background">
                            {candidate.photoUrl ? (
                              <img src={candidate.photoUrl} alt={candidate.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{candidate.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                                Paid: {candidate.paidVotes || 0}
                              </span>
                              <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                                Manual: {candidate.manualVotes || 0}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">{candidate.totalVotes} votes</p>
                          <p className="text-sm text-muted-foreground">Revenue: GHS {Number(candidate.revenue || 0).toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))]"
                          style={{ width: `${candidate.progressPercent}%` }}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}
