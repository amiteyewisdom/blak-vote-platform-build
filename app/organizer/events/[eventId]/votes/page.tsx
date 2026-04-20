'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, AlertTriangle, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
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

  const nomineeLabel = (nominee: NomineeItem) => {
    const label = nominee.nominee_name
    return label && String(label).trim().length > 0 ? label : `Nominee ${nominee.nominee_id.slice(0, 8)}`
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
    const { data } = await supabase
      .from('votes')
      .select(`
        *,
        nominations(nominee_name)
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (data) setVotes(data)
    await loadNominees()

    const auditRes = await fetch(`/api/votes/audit?eventId=${encodeURIComponent(eventId)}&limit=250`)
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

  const totalRevenue = votes.reduce(
    (sum, v) => (String(v.vote_type || '').toLowerCase() === 'paid' ? sum + Number(v.amount_paid) : sum),
    0
  )

  const paidTransactions = votes.filter(
    (v) => String(v.vote_type || '').toLowerCase() === 'paid'
  ).length

  const totalVotes = votes.reduce(
    (sum, v) => sum + Number(v.quantity ?? 1),
    0
  )

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
          Votes &amp; Revenue
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Vote totals include paid + manual votes. Revenue includes paid votes only.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid md:grid-cols-3 gap-6">

        <MetricCard
          title="Total Votes (Paid + Manual)"
          value={totalVotes.toString()}
        />

        <MetricCard
          title="Revenue (Paid Only)"
          value={`GHS ${totalRevenue.toFixed(2)}`}
        />

        <MetricCard
          title="Paid Transactions"
          value={paidTransactions.toString()}
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

      {tab === 'transactions' && (
      <div className="overflow-x-auto bg-surface-card rounded-3xl border border-border/70">

        <table className="w-full text-left">
          <thead className="text-muted-foreground text-sm border-b border-border/70">
            <tr>
              <th className="p-4">Nominee</th>
              <th className="p-4">Votes</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>

          <tbody>
            {votes.map((vote) => (
              <tr
                key={vote.id}
                className="border-b border-border/70 hover:bg-surface/70"
              >
                <td className="p-4">
                  {vote.nominations?.nominee_name}
                </td>
                <td className="p-4">
                  {vote.votes_count}
                </td>
                <td className="p-4">
                  GHS {vote.amount_paid}
                </td>
                <td className="p-4">
                  {vote.payment_status}
                </td>
                <td className="p-4 text-muted-foreground">
                  {new Date(vote.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
      )}

      {tab === 'record' && (
        <div className="space-y-6">
          <DSCard className="p-5 md:p-6">
            <h3 className="text-lg font-semibold mb-2">Manual Votes & Audit</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add verified manual votes to nominee totals. Category is auto-linked from nominee when available. Revenue remains paid-votes only.
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
                {auditLogs.map((row) => {
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