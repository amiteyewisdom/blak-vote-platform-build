'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ScanLine, ScanQrCode, Trash2 } from 'lucide-react'
import { DSCard, DSInput, DSPrimaryButton, DSSecondaryButton } from '@/components/ui/design-system'
import { supabase } from '@/lib/supabaseClient'

type TicketPlan = {
  id: string
  name: string
  price: number
  admin_fee: number
  totalQuantity: number
  soldCount: number
  usedCount: number
  remainingQuantity: number
  grossRevenue: number
  netRevenue: number
  isSoldOut: boolean
}

type VerificationResult = {
  valid?: boolean
  invalid?: boolean
  alreadyUsed?: boolean
  message?: string
  ticket?: {
    ticket_code: string
    name?: string | null
    buyer_name?: string | null
    buyer_email?: string | null
    used_at?: string | null
  }
}

const defaultForm = {
  name: 'Regular',
  price: '0',
  quantity: '100',
}

export default function EventTicketsPage() {
  const params = useParams()
  const eventId = String(params?.eventId || '')
  const router = useRouter()

  const [ticketPlans, setTicketPlans] = useState<TicketPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)

  const [verificationCode, setVerificationCode] = useState('')
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncOnlineState = () => setIsOffline(!navigator.onLine)
    syncOnlineState()

    window.addEventListener('online', syncOnlineState)
    window.addEventListener('offline', syncOnlineState)

    return () => {
      window.removeEventListener('online', syncOnlineState)
      window.removeEventListener('offline', syncOnlineState)
    }
  }, [])

  const getAccessToken = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.access_token) {
        return session.access_token
      }

      // Force a user/session read to recover from hydration timing gaps.
      await supabase.auth.getUser()
      const {
        data: { session: refreshedSession },
      } = await supabase.auth.getSession()

      return refreshedSession?.access_token || null
    } catch {
      return null
    }
  }

  const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return new Response(
        JSON.stringify({ error: 'No internet connection. Reconnect and try again.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const token = await getAccessToken()

    const headers = new Headers(init?.headers || undefined)
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(input, {
      ...init,
      headers,
    })

    if (response.status !== 401) {
      return response
    }

    let retryToken: string | null = null
    try {
      const { data: refreshed } = await supabase.auth.refreshSession()
      retryToken = refreshed.session?.access_token || null
    } catch {
      retryToken = null
    }

    if (!retryToken) {
      return response
    }

    const retryHeaders = new Headers(init?.headers || undefined)
    retryHeaders.set('Authorization', `Bearer ${retryToken}`)

    return fetch(input, {
      ...init,
      headers: retryHeaders,
    })
  }

  const composeApiError = (payload: any, fallback: string) => {
    const base = String(payload?.error || fallback)
    const detail = payload?.details ? String(payload.details) : ''
    const hint = payload?.hint ? String(payload.hint) : ''
    const code = payload?.code ? ` (${String(payload.code)})` : ''
    const parts = [base]

    if (detail) {
      parts.push(detail)
    }

    if (hint) {
      parts.push(`Hint: ${hint}`)
    }

    return `${parts.join(' - ')}${code}`
  }

  const fetchTicketPlans = async () => {
    if (!eventId) {
      return
    }

    setLoading(true)
    const res = await fetchWithAuth(`/api/tickets/create?eventId=${eventId}`)
    const payload = await res.json()

    if (!res.ok) {
      setError(composeApiError(payload, 'Unable to load ticket plans'))
      setTicketPlans([])
      setLoading(false)
      return
    }

    setTicketPlans(payload.ticketPlans || [])
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void fetchTicketPlans()
  }, [eventId])

  const resetForm = () => {
    setForm(defaultForm)
    setEditingPlanId(null)
  }

  const submitPlan = async () => {
    setSaving(true)
    setFeedback(null)
    setError(null)

    const method = editingPlanId ? 'PATCH' : 'POST'
    const body = editingPlanId
      ? {
          ticketId: editingPlanId,
          name: form.name,
          price: Number(form.price),
          quantity: Number(form.quantity),
        }
      : {
          event_id: eventId,
          name: form.name,
          price: Number(form.price),
          quantity: Number(form.quantity),
        }

    const res = await fetchWithAuth('/api/tickets/create', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const payload = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(composeApiError(payload, 'Unable to save ticket plan'))
      return
    }

    setFeedback(payload.message || (editingPlanId ? 'Ticket plan updated' : 'Ticket plan created'))
    resetForm()
    await fetchTicketPlans()
  }

  const startEditing = (plan: TicketPlan) => {
    setEditingPlanId(plan.id)
    setForm({
      name: plan.name,
      price: String(plan.price),
      quantity: String(plan.totalQuantity),
    })
    setFeedback(null)
    setError(null)
  }

  const deletePlan = async (ticketId: string) => {
    setDeletingId(ticketId)
    setFeedback(null)
    setError(null)

    const res = await fetchWithAuth('/api/tickets/create', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })

    const payload = await res.json()
    setDeletingId(null)

    if (!res.ok) {
      setError(composeApiError(payload, 'Unable to delete ticket plan'))
      return
    }

    setFeedback(payload.message || 'Ticket plan deleted')
    if (editingPlanId === ticketId) {
      resetForm()
    }
    await fetchTicketPlans()
  }

  const verifyTicket = async (markAsUsed: boolean) => {
    if (!verificationCode.trim()) {
      return
    }

    setVerificationBusy(true)
    setVerificationError(null)
    setVerificationResult(null)

    const endpoint = '/api/tickets/verify'
    const res = await fetch(
      markAsUsed ? endpoint : `${endpoint}?code=${encodeURIComponent(verificationCode.trim())}`,
      markAsUsed
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: verificationCode.trim() }),
          }
        : undefined
    )
    const payload = await res.json()

    setVerificationBusy(false)

    if (!res.ok) {
      setVerificationError(payload.error || 'Verification failed')
      return
    }

    setVerificationResult(payload)
    if (markAsUsed) {
      await fetchTicketPlans()
    }
  }

  const totals = ticketPlans.reduce(
    (acc, plan) => {
      acc.capacity += plan.totalQuantity
      acc.sold += plan.soldCount
      acc.remaining += plan.remainingQuantity
      acc.grossRevenue += plan.grossRevenue
      acc.netRevenue += plan.netRevenue
      return acc
    },
    { capacity: 0, sold: 0, remaining: 0, grossRevenue: 0, netRevenue: 0 }
  )

  return (
    <div className="p-4 md:p-8 text-foreground space-y-6">
      <DSSecondaryButton onClick={() => router.back()} className="inline-flex items-center gap-2 text-foreground/70 hover:text-foreground">
        <ArrowLeft size={16} /> Back
      </DSSecondaryButton>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Event Ticketing</h1>
        <p className="text-muted-foreground">Manage ticket plans, monitor sold inventory, and validate attendee tickets in one workflow.</p>
      </div>

      {isOffline && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          You are offline. Ticket plan operations require internet access to reach Supabase.
        </div>
      )}

      <div>
        <DSPrimaryButton
          onClick={() => router.push(`/organizer/events/${eventId}/scan`)}
          className="inline-flex items-center gap-2 px-5 py-3"
        >
          <ScanQrCode size={18} />
          Open QR Scanner
        </DSPrimaryButton>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DSCard className="p-4">
          <p className="text-sm text-muted-foreground">Total Capacity</p>
          <p className="mt-2 text-2xl font-bold">{totals.capacity}</p>
        </DSCard>
        <DSCard className="p-4">
          <p className="text-sm text-muted-foreground">Tickets Sold</p>
          <p className="mt-2 text-2xl font-bold">{totals.sold}</p>
        </DSCard>
        <DSCard className="p-4">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p className="mt-2 text-2xl font-bold">{totals.remaining}</p>
        </DSCard>
        <DSCard className="p-4">
          <p className="text-sm text-muted-foreground">Net Ticket Revenue</p>
          <p className="mt-2 text-2xl font-bold">GHS {totals.netRevenue.toFixed(2)}</p>
        </DSCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <DSCard className="p-4 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{editingPlanId ? 'Edit Ticket Plan' : 'Create Ticket Plan'}</h2>
            <p className="text-sm text-muted-foreground">Platform commission is calculated automatically from current admin settings.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <DSInput className="bg-surface" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Ticket name" />
            <DSInput className="bg-surface" value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} placeholder="Price" type="number" min="0" />
            <DSInput className="bg-surface" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} placeholder="Inventory" type="number" min="1" />
          </div>

          {(feedback || error) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
              {error || feedback}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <DSPrimaryButton onClick={submitPlan} disabled={saving} className="px-5 py-3">
              {saving ? 'Saving...' : editingPlanId ? 'Update Plan' : 'Create Plan'}
            </DSPrimaryButton>
            {editingPlanId && (
              <DSSecondaryButton onClick={resetForm} className="px-5 py-3">
                Cancel Edit
              </DSSecondaryButton>
            )}
          </div>
        </DSCard>

        <DSCard className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <h2 className="text-lg font-semibold">Validate Ticket</h2>
          </div>
          <p className="text-sm text-muted-foreground">Search a ticket code first, then optionally mark it as used at the gate.</p>
          <DSInput className="bg-surface" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.toUpperCase())} placeholder="Enter ticket code" />
          <div className="flex flex-wrap gap-3">
            <DSSecondaryButton onClick={() => verifyTicket(false)} disabled={verificationBusy} className="px-4 py-3">
              {verificationBusy ? 'Checking...' : 'Check Status'}
            </DSSecondaryButton>
            <DSPrimaryButton onClick={() => verifyTicket(true)} disabled={verificationBusy} className="px-4 py-3">
              {verificationBusy ? 'Applying...' : 'Mark As Used'}
            </DSPrimaryButton>
          </div>

          {verificationError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {verificationError}
            </div>
          )}

          {verificationResult && (
            <div className="rounded-xl border border-border bg-surface px-4 py-4 text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} className={verificationResult.valid ? 'text-emerald-500' : verificationResult.alreadyUsed ? 'text-amber-500' : 'text-muted-foreground'} />
                <span>{verificationResult.message || 'Verification complete'}</span>
              </div>
              <p>Code: {verificationResult.ticket?.ticket_code || verificationCode.trim().toUpperCase()}</p>
              {verificationResult.ticket?.name && <p>Plan: {verificationResult.ticket.name}</p>}
              {verificationResult.ticket?.buyer_name && <p>Buyer: {verificationResult.ticket.buyer_name}</p>}
              {verificationResult.ticket?.buyer_email && <p>Email: {verificationResult.ticket.buyer_email}</p>}
              {verificationResult.ticket?.used_at && <p>Used At: {new Date(verificationResult.ticket.used_at).toLocaleString()}</p>}
            </div>
          )}
        </DSCard>
      </div>

      <DSCard className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Ticket Plans</h2>
            <p className="text-sm text-muted-foreground">Each plan tracks its own sellable inventory and issued tickets.</p>
          </div>
          <DSSecondaryButton onClick={() => void fetchTicketPlans()} className="px-4 py-2">
            Refresh
          </DSSecondaryButton>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading ticket plans...</p>
        ) : ticketPlans.length === 0 ? (
          <p className="text-muted-foreground">No ticket plans created yet.</p>
        ) : (
          <div className="space-y-3">
            {ticketPlans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-border p-4 space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">GHS {plan.price.toFixed(2)} per ticket</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-semibold">Remaining: {plan.remainingQuantity}</p>
                    <p className="text-sm text-muted-foreground">Used: {plan.usedCount}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5 text-sm">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-muted-foreground">Capacity</p>
                    <p className="mt-1 font-semibold">{plan.totalQuantity}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-muted-foreground">Sold</p>
                    <p className="mt-1 font-semibold">{plan.soldCount}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-muted-foreground">Platform Fee</p>
                    <p className="mt-1 font-semibold">GHS {plan.admin_fee.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-muted-foreground">Gross Revenue</p>
                    <p className="mt-1 font-semibold">GHS {plan.grossRevenue.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-muted-foreground">Net Revenue</p>
                    <p className="mt-1 font-semibold">GHS {plan.netRevenue.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <DSSecondaryButton onClick={() => startEditing(plan)} className="px-4 py-2">
                    Edit Plan
                  </DSSecondaryButton>
                  <DSSecondaryButton
                    onClick={() => deletePlan(plan.id)}
                    disabled={deletingId === plan.id || plan.soldCount > 0}
                    className="px-4 py-2"
                  >
                    <Trash2 size={14} />
                    {deletingId === plan.id ? 'Deleting...' : 'Delete Plan'}
                  </DSSecondaryButton>
                  {plan.isSoldOut && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Sold Out
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DSCard>
    </div>
  )
}