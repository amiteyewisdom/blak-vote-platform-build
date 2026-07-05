'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Check, ChevronsUpDown, Download, Loader2, X } from 'lucide-react'
import { DSCard, DSInput, DSPrimaryButton, DSSecondaryButton } from '@/components/ui/design-system'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

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
  manual_reason: string | null
  occurred_at: string
}

interface NomineeItem {
  nominee_id: string
  nominee_name: string
  photo_url: string | null
  category_id: string | null
  category_name: string | null
  event_id: string
  status: string
}

export default function VotesPage() {
  const params = useParams()
  const eventId = String(params?.eventId || params?.id)
  const router = useRouter()

  const [votes, setVotes] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [nominees, setNominees] = useState<NomineeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'transactions' | 'record'>('transactions')
  const [submitting, setSubmitting] = useState(false)

  const [isManualVoteModalOpen, setIsManualVoteModalOpen] = useState(false)
  const [isNomineeDropdownOpen, setIsNomineeDropdownOpen] = useState(false)
  const [nomineesLoading, setNomineesLoading] = useState(false)
  const [nomineeDetailLoading, setNomineeDetailLoading] = useState(false)
  const [recordNomineeId, setRecordNomineeId] = useState('')
  const [recordCategoryId, setRecordCategoryId] = useState<string | null>(null)
  const [recordCategoryName, setRecordCategoryName] = useState('')
  const [recordCount, setRecordCount] = useState('1')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [categoryUpdatePulse, setCategoryUpdatePulse] = useState(false)

  // Filters
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [filterNomineeId, setFilterNomineeId] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const nomineeLabel = (nominee: NomineeItem) => {
    const label = nominee.nominee_name
    return label && String(label).trim().length > 0 ? label : `Nominee ${nominee.nominee_id.slice(0, 8)}`
  }

  const paidVotes = votes.filter((vote) => String(vote.vote_type || '').toLowerCase() === 'paid')
  const paidAuditEntries = auditLogs.filter((log) => String(log.vote_type || '').toLowerCase() === 'paid')

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of nominees) {
      if (n.category_name) {
        map.set(n.category_name, n.category_name)
      }
    }
    return Array.from(map.values()).sort()
  }, [nominees])

  const years = useMemo(() => {
    const set = new Set<string>()
    for (const v of votes) {
      const d = v.created_at || v.occurred_at
      if (d) set.add(new Date(d).getFullYear().toString())
    }
    for (const l of auditLogs) {
      if (l.occurred_at) set.add(new Date(l.occurred_at).getFullYear().toString())
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a))
  }, [votes, auditLogs])

  const matchesDateFilter = (dateString: string | null | undefined) => {
    if (!dateString) return false
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return false
    const dateOnly = d.toISOString().split('T')[0]

    if (startDate && dateOnly < startDate) return false
    if (endDate && dateOnly > endDate) return false
    if (selectedYear && d.getFullYear().toString() !== selectedYear) return false
    if (selectedMonth && (d.getMonth() + 1).toString().padStart(2, '0') !== selectedMonth) return false
    return true
  }

  const getNomineeRow = (candidateId: string | null | undefined) => {
    if (!candidateId) return null
    return nominees.find((n) => n.nominee_id === candidateId) || null
  }

  const filteredPaidVotes = useMemo(() => {
    return votes
      .filter((vote) => String(vote.vote_type || '').toLowerCase() === 'paid')
      .filter((vote) => {
        if (!matchesDateFilter(vote.created_at)) return false
        if (filterNomineeId && vote.candidate_id !== filterNomineeId) return false
        if (filterCategory) {
          const nominee = getNomineeRow(vote.candidate_id)
          if (nominee?.category_name !== filterCategory) return false
        }
        return true
      })
  }, [votes, startDate, endDate, selectedYear, selectedMonth, filterNomineeId, filterCategory, nominees])

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (!matchesDateFilter(log.occurred_at)) return false
      if (filterNomineeId && log.candidate_id !== filterNomineeId) return false
      if (filterCategory) {
        const nominee = getNomineeRow(log.candidate_id)
        if (nominee?.category_name !== filterCategory) return false
      }
      return true
    })
  }, [auditLogs, startDate, endDate, selectedYear, selectedMonth, filterNomineeId, filterCategory, nominees])

  const exportCSV = (rows: any[], filename: string) => {
    const headers = Object.keys(rows[0] || {})
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h]
            const str = val === null || val === undefined ? '' : String(val)
            return `"${str.replace(/"/g, '""')}"`
          })
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportPaidVotes = () => {
    const rows = filteredPaidVotes.map((vote) => {
      const nominee = getNomineeRow(vote.candidate_id)
      return {
        nominee: nominee ? nomineeLabel(nominee) : vote.candidate_id || '',
        category: nominee?.category_name || '',
        status: vote.payment_status || vote.vote_type || 'paid',
        date: vote.created_at ? new Date(vote.created_at).toLocaleString() : '',
        quantity: vote.quantity ?? 1,
        voter_id: vote.voter_id || '',
        voter_phone: vote.voter_phone || '',
      }
    })
    exportCSV(rows, `paid-votes-${eventId}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const exportAuditLogs = () => {
    const rows = filteredAuditLogs.map((log) => {
      const nominee = getNomineeRow(log.candidate_id)
      const actor = log.added_by_name || log.added_by_email || log.added_by_user_id || 'System'
      return {
        nominee: nominee ? nomineeLabel(nominee) : log.candidate_id || '',
        category: nominee?.category_name || '',
        quantity: log.quantity ?? 1,
        type: log.vote_type,
        voter: log.voter_id || log.voter_phone || 'Guest / unknown',
        added_by: actor,
        manual_mode: log.manual_entry_mode || '',
        logged_at: log.occurred_at ? new Date(log.occurred_at).toLocaleString() : '',
      }
    })
    exportCSV(rows, `audit-logs-${eventId}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
    setSelectedYear('')
    setSelectedMonth('')
    setFilterNomineeId('')
    setFilterCategory('')
  }

  const selectedNominee = nominees.find((nominee) => nominee.nominee_id === recordNomineeId)
  const isSubmitDisabled =
    submitting ||
    nomineeDetailLoading ||
    nomineesLoading ||
    !recordNomineeId ||
    !recordCategoryId ||
    !recordCount ||
    Number(recordCount) <= 0

  useEffect(() => {
    fetchVotes()
  }, [eventId])

  useEffect(() => {
    if (!recordNomineeId) return
    hydrateNomineeCategory(recordNomineeId)
  }, [recordNomineeId])

  const loadNominees = async () => {
    setNomineesLoading(true)
    try {
      const res = await fetch(`/api/nominations/by-event?event_id=${encodeURIComponent(eventId)}`)
      if (!res.ok) {
        setNominees([])
        return
      }

      const payload = await res.json()
      const nomineeRows = (payload.nominees || []) as NomineeItem[]
      setNominees(nomineeRows)

      if (!recordNomineeId && nomineeRows[0]?.nominee_id) {
        setRecordNomineeId(nomineeRows[0].nominee_id)
      }
    } finally {
      setNomineesLoading(false)
    }
  }

  const hydrateNomineeCategory = async (nomineeId: string) => {
    if (!nomineeId) {
      setRecordCategoryId(null)
      setRecordCategoryName('')
      return
    }

    setNomineeDetailLoading(true)
    try {
      const res = await fetch(
        `/api/nominations/by-event?event_id=${encodeURIComponent(eventId)}&nominee_id=${encodeURIComponent(nomineeId)}`
      )

      if (!res.ok) {
        setRecordCategoryId(null)
        setRecordCategoryName('')
        setValidationError('Unable to load nominee category. Please reselect nominee.')
        return
      }

      const payload = await res.json()
      const nominee = payload.nominee as NomineeItem | null

      if (!nominee || !nominee.category_id) {
        setRecordCategoryId(null)
        setRecordCategoryName('Uncategorized')
        setValidationError('Selected nominee has no category linked.')
        return
      }

      setRecordCategoryId(nominee.category_id)
      setRecordCategoryName(nominee.category_name || 'Uncategorized')
      setValidationError(null)
      setCategoryUpdatePulse(true)
      window.setTimeout(() => setCategoryUpdatePulse(false), 450)
    } finally {
      setNomineeDetailLoading(false)
    }
  }

  const fetchVotes = async () => {
    const votesRes = await fetch(`/api/organizer/votes?eventId=${encodeURIComponent(eventId)}`, {
      cache: 'no-store',
    })
    if (votesRes.ok) {
      const payload = await votesRes.json().catch(() => ({}))
      setVotes(payload.votes || [])
    } else {
      console.error('[VotesPage] votes API error:', votesRes.status, await votesRes.text().catch(() => ''))
    }
    await loadNominees()

    const auditRes = await fetch(`/api/votes/audit?eventId=${encodeURIComponent(eventId)}&limit=250`, {
      cache: 'no-store',
    })
    if (auditRes.ok) {
      const payload = await auditRes.json()
      setAuditLogs(payload.logs || [])
    }

    setLoading(false)
  }

  const submitVoteRecord = async () => {
    const quantity = Number(recordCount)

    if (!recordNomineeId) {
      setValidationError('Nominee is required.')
      return
    }

    if (!recordCategoryId) {
      setValidationError('Nominee must be linked to a category.')
      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setValidationError('Number of votes must be greater than zero.')
      return
    }

    setSubmitting(true)
    setValidationError(null)

    const payload = {
      votes: [
        {
          type: 'manual',
          nominee_id: recordNomineeId,
          event_id: eventId,
          count: quantity,
          method: 'manual',
          category_id: recordCategoryId,
          reason: 'Manual organizer vote entry',
        },
      ],
    }

    const res = await fetch('/api/vote/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSubmitting(false)

    if (res.ok) {
      setRecordCount('1')
      setIsManualVoteModalOpen(false)
      await fetchVotes()
      setTab('record')
      return
    }

    const errorPayload = await res.json().catch(() => ({}))
    const detailParts = [
      errorPayload?.error,
      errorPayload?.details
        ? (typeof errorPayload.details === 'string'
            ? errorPayload.details
            : JSON.stringify(errorPayload.details))
        : null,
      errorPayload?.hint,
      errorPayload?.code,
      Array.isArray(errorPayload?.failures) && errorPayload.failures[0]?.error
        ? `First failure: ${String(errorPayload.failures[0].error)}`
        : null,
    ]
      .filter(Boolean)
      .map((part) => String(part))
    setValidationError(detailParts.join(' | ') || 'Failed to record manual vote.')
  }

  const paidTransactions = Math.max(paidVotes.length, paidAuditEntries.length)

  if (loading)
    return (
      <div className="p-12">
        <div className="h-40 bg-surface-card rounded-3xl animate-pulse" />
      </div>
    )

  return (
    <div className="p-6 md:p-12 space-y-10">

      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-3xl font-semibold">
          Votes &amp; Transactions
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Track and manage votes and transactions.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid md:grid-cols-2 gap-6">

        <MetricCard
          title="Paid Transactions"
          value={paidTransactions.toString()}
        />

        <MetricCard
          title="Total Votes"
          value={filteredPaidVotes.length.toString()}
        />

      </div>

      {/* Table */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTab('transactions')}
          className={`px-4 py-2 rounded-xl border ${tab === 'transactions' ? 'bg-gold text-black border-gold' : 'border-white/15 text-foreground/80'}`}
        >
          Paid Votes
        </button>
        <button
          onClick={() => setTab('record')}
          className={`px-4 py-2 rounded-xl border ${tab === 'record' ? 'bg-gold text-black border-gold' : 'border-white/15 text-foreground/80'}`}
        >
          Manual Votes & Audit
        </button>
      </div>

      {/* Filters */}
      <DSCard className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row gap-4 flex-wrap items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm min-w-[100px]"
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm min-w-[120px]"
            >
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((m) => (
                <option key={m} value={m}>
                  {new Date(2024, Number(m) - 1, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nominee</label>
            <select
              value={filterNomineeId}
              onChange={(e) => setFilterNomineeId(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm min-w-[160px]"
            >
              <option value="">All nominees</option>
              {nominees.map((n) => (
                <option key={n.nominee_id} value={n.nominee_id}>{nomineeLabel(n)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-10 rounded-xl border border-input bg-card px-3 text-sm min-w-[140px]"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <DSSecondaryButton
              onClick={clearFilters}
              className="px-3 py-2 text-sm h-10"
            >
              <X size={16} className="mr-1" />
              Clear
            </DSSecondaryButton>
            <DSPrimaryButton
              onClick={tab === 'transactions' ? exportPaidVotes : exportAuditLogs}
              className="px-3 py-2 text-sm h-10"
            >
              <Download size={16} className="mr-1" />
              Export
            </DSPrimaryButton>
          </div>
        </div>
      </DSCard>

      {tab === 'transactions' && (
      <div className="overflow-x-auto bg-surface-card rounded-3xl border border-border/70">

        <table className="w-full text-left">
          <thead className="text-muted-foreground text-sm border-b border-border/70">
            <tr>
              <th className="p-4">Nominee</th>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>

          <tbody>
            {filteredPaidVotes.map((vote) => {
              const nomineeRow = nominees.find((n) => n.nominee_id === vote.candidate_id)
              const nomineeName = nomineeRow ? nomineeLabel(nomineeRow) : vote.candidate_id
              return (
                <tr
                  key={vote.id}
                  className="border-b border-border/70 hover:bg-surface/70"
                >
                  <td className="p-4">
                    {nomineeName}
                  </td>
                  <td className="p-4">
                    {vote.payment_status || vote.vote_type || 'paid'}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {new Date(vote.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
            {filteredPaidVotes.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">
                  No matching paid votes
                </td>
              </tr>
            )}
          </tbody>
        </table>

      </div>
      )}

      {tab === 'record' && (
        <div className="space-y-6">
          <DSCard className="p-5 md:p-6">
            <h3 className="text-lg font-semibold mb-2">Manual Votes & Audit</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add verified manual votes to nominee totals. Category is auto-linked from nominee when available.
            </p>
            <DSPrimaryButton
              onClick={() => {
                setValidationError(null)
                setIsManualVoteModalOpen(true)
              }}
              className="px-5 py-3"
            >
              Add Manual Votes
            </DSPrimaryButton>
          </DSCard>

          <Dialog open={isManualVoteModalOpen} onOpenChange={setIsManualVoteModalOpen}>
            <DialogContent className="max-w-xl rounded-2xl p-0 overflow-hidden">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle>Record Manual Votes</DialogTitle>
                <DialogDescription>
                  Select nominee, review auto-filled category, and enter vote quantity.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-6 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Votes added here will NOT count towards revenue</span>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nominee</label>
                  <Popover open={isNomineeDropdownOpen} onOpenChange={setIsNomineeDropdownOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm text-left flex items-center justify-between"
                        disabled={nomineesLoading || submitting}
                      >
                        <span className="truncate">
                          {selectedNominee ? nomineeLabel(selectedNominee) : nomineesLoading ? 'Loading nominees...' : 'Select nominee'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search nominee..." />
                        <CommandList>
                          <CommandEmpty>No nominees found.</CommandEmpty>
                          <CommandGroup>
                            {nominees.map((nominee) => (
                              <CommandItem
                                key={nominee.nominee_id}
                                value={`${nominee.nominee_name} ${nominee.category_name || ''}`}
                                onSelect={() => {
                                  setRecordNomineeId(nominee.nominee_id)
                                  setIsNomineeDropdownOpen(false)
                                }}
                                className="gap-3"
                              >
                                <div className="h-8 w-8 rounded-full overflow-hidden bg-surface shrink-0 border border-border">
                                  {nominee.photo_url ? (
                                    <img src={nominee.photo_url} alt={nominee.nominee_name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                                      {nominee.nominee_name.slice(0, 1).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{nominee.nominee_name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{nominee.category_name || 'Uncategorized'}</p>
                                </div>
                                {recordNomineeId === nominee.nominee_id ? <Check className="h-4 w-4" /> : null}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <div
                    className={cn(
                      'h-11 w-full rounded-xl border border-input bg-surface px-4 text-sm flex items-center transition-all',
                      categoryUpdatePulse ? 'ring-2 ring-gold/40' : ''
                    )}
                  >
                    {nomineeDetailLoading ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Fetching category...
                      </span>
                    ) : (
                      <span className="text-foreground/90">{recordCategoryName || 'Category will auto-fill from nominee'}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Number of Votes</label>
                  <DSInput
                    value={recordCount}
                    onChange={(e) => setRecordCount(e.target.value)}
                    type="number"
                    min="1"
                    className="bg-surface"
                    placeholder="Enter vote quantity"
                    disabled={submitting}
                  />
                </div>

                {validationError ? (
                  <p className="text-sm text-red-400">{validationError}</p>
                ) : null}
              </div>

              <DialogFooter className="px-6 pb-6 gap-2">
                <DSSecondaryButton
                  onClick={() => setIsManualVoteModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </DSSecondaryButton>
                <DSPrimaryButton
                  onClick={submitVoteRecord}
                  disabled={isSubmitDisabled}
                >
                  {submitting ? 'Submitting...' : 'Submit Votes'}
                </DSPrimaryButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="overflow-x-auto bg-surface-card rounded-3xl border border-border/70">
            <table className="w-full text-left">
              <thead className="text-muted-foreground text-sm border-b border-border/70">
                <tr>
                  <th className="p-4">Nominee</th>
                  <th className="p-4">Qty</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Voter</th>
                  <th className="p-4">Added By</th>
                  <th className="p-4">Logged At</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map((row) => {
                  const nomineeRow = nominees.find((n) => n.nominee_id === row.candidate_id)
                  const nomineeName = nomineeRow ? nomineeLabel(nomineeRow) : row.candidate_id
                  const actorLabel = row.added_by_name || row.added_by_email || row.added_by_user_id || 'System'
                  const voterLabel = row.voter_id || row.voter_phone || 'Guest / unknown'
                  return (
                    <tr key={row.id} className="border-b border-border/70 hover:bg-surface/70">
                      <td className="p-4">{nomineeName}</td>
                      <td className="p-4">{row.quantity ?? 1}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                          row.vote_type === 'manual'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : row.vote_type === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {row.vote_type}
                          {row.manual_entry_mode ? ` / ${row.manual_entry_mode}` : ''}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground/70">{voterLabel}</td>
                      <td className="p-4 text-sm text-foreground/70">{actorLabel}</td>
                      <td className="p-4 text-muted-foreground">{new Date(row.occurred_at).toLocaleString()}</td>
                    </tr>
                  )
                })}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No matching audit logs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

function MetricCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.35)] flex flex-col gap-3">
      <p className="text-xs uppercase tracking-widest font-medium text-muted-foreground">
        {title}
      </p>
      <div className="text-2xl font-bold text-foreground leading-none">
        {value}
      </div>
    </div>
  )
}