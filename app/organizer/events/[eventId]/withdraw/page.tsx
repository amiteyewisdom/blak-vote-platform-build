'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSSelect } from '@/components/ui/design-system'
import { Button } from '@/components/ui/button'

interface TransferOption {
  code: string
  name: string
}

interface VerifiedBankAccount {
  accountNumber: string
  bankCode: string
  accountName: string
}

function maskValue(value: string | null) {
  if (!value) return null
  if (value.length <= 4) return value
  return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`
}

export default function WithdrawPage() {
  const { eventId: rawEventId } = useParams()
  const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId
  const router = useRouter()
  const { toast } = useToast()

  const [event, setEvent] = useState<any>(null)
  const [earnings, setEarnings] = useState<any>(null)
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer')
  const [accountName, setAccountName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [selectedBankCode, setSelectedBankCode] = useState('')
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('')
  const [selectedMobileMoneyCode, setSelectedMobileMoneyCode] = useState('')
  const [bankOptions, setBankOptions] = useState<TransferOption[]>([])
  const [mobileMoneyOptions, setMobileMoneyOptions] = useState<TransferOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [verifyingBankAccount, setVerifyingBankAccount] = useState(false)
  const [verifiedBankAccount, setVerifiedBankAccount] = useState<VerifiedBankAccount | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!eventId) return
    init()
  }, [eventId])

  const init = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/sign-in'); return }

      const [eventRes, earningsRes, optionsRes, withdrawRes] = await Promise.all([
        fetch(`/api/organizer/event/${encodeURIComponent(eventId!)}`),
        fetch('/api/organizer/wallet/events'),
        fetch('/api/organizer/wallet/withdrawal-options'),
        supabase
          .from('organizer_withdrawals')
          .select('*')
          .eq('organizer_id', user.id)
          .eq('event_id', eventId)
          .order('created_at', { ascending: false }),
      ])

      if (eventRes.ok) {
        const p = await eventRes.json().catch(() => ({}))
        setEvent(p?.event ?? null)
      }

      if (earningsRes.ok) {
        const p = await earningsRes.json().catch(() => ({}))
        const all = p?.earnings || []
        const match = all.find((e: any) => e.event_id === eventId)
        if (match) setEarnings(match)
      }

      if (optionsRes.ok) {
        const p = await optionsRes.json().catch(() => ({}))
        setBankOptions(Array.isArray(p.banks) ? p.banks : [])
        setMobileMoneyOptions(Array.isArray(p.mobileMoney) ? p.mobileMoney : [])
      }

      if (withdrawRes.data) setWithdrawals(withdrawRes.data)
    } finally {
      setLoading(false)
      setLoadingOptions(false)
    }
  }

  const isTicketing = event?.event_type === 'ticketing'
  const netEarnings = isTicketing
    ? Number(earnings?.ticket_net_earnings ?? earnings?.net_earnings ?? 0)
    : Number(earnings?.vote_net_earnings ?? earnings?.net_earnings ?? 0)
  const totalWithdrawn = isTicketing
    ? Number(earnings?.withdrawn_ticket_revenue ?? 0)
    : Number(earnings?.withdrawn_vote_revenue ?? 0)
  const available = Math.max(netEarnings - totalWithdrawn, 0)

  const handleWithdraw = async () => {
    if (available <= 0) {
      toast({ title: 'No Balance', description: 'No available balance for this event.', variant: 'destructive' })
      return
    }
    const parsed = Number(withdrawAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: 'Invalid Amount', description: 'Enter a valid amount.', variant: 'destructive' })
      return
    }
    if (parsed > available) {
      toast({ title: 'Insufficient Balance', description: 'Amount exceeds available balance for this event.', variant: 'destructive' })
      return
    }
    const trimmedName = accountName.trim()
    if (!trimmedName) {
      toast({ title: 'Missing Account Name', description: 'Enter the recipient name.', variant: 'destructive' })
      return
    }
    const isMM = withdrawMethod === 'mobile_money'
    const destNumber = (isMM ? mobileMoneyNumber : bankAccountNumber).trim()
    const destCode = (isMM ? selectedMobileMoneyCode : selectedBankCode).trim()
    if (!destNumber) {
      toast({ title: isMM ? 'Missing Mobile Number' : 'Missing Account Number', description: 'Enter the destination number.', variant: 'destructive' })
      return
    }
    if (!destCode) {
      toast({ title: isMM ? 'Missing Provider' : 'Missing Bank', description: 'Select the destination.', variant: 'destructive' })
      return
    }
    if (!isMM && (!verifiedBankAccount || verifiedBankAccount.accountNumber !== destNumber || verifiedBankAccount.bankCode !== destCode)) {
      toast({ title: 'Verify Account First', description: 'Verify the bank account before submitting.', variant: 'destructive' })
      return
    }

    const accountDetails: Record<string, unknown> = {
      name: isMM ? trimmedName : verifiedBankAccount?.accountName || trimmedName,
      account_name: isMM ? trimmedName : verifiedBankAccount?.accountName || trimmedName,
      account_number: destNumber,
      bank_code: destCode,
      currency: 'GHS',
      paystackRecipientType: isMM ? 'mobile_money' : 'ghipss',
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/organizer/wallet/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsed,
          method: withdrawMethod,
          accountDetails,
          eventId,
          withdrawalType: isTicketing ? 'ticket' : 'vote',
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to request withdrawal')

      toast({
        title: 'Withdrawal Submitted',
        description: `GHS ${parsed.toFixed(2)} withdrawal request submitted. Pending admin review.`,
      })

      setWithdrawAmount('')
      setAccountName('')
      setBankAccountNumber('')
      setSelectedBankCode('')
      setMobileMoneyNumber('')
      setSelectedMobileMoneyCode('')
      setVerifiedBankAccount(null)

      await init()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to request withdrawal', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const verifyBankAccount = async () => {
    const acctNum = bankAccountNumber.trim()
    const bCode = selectedBankCode.trim()
    if (!acctNum || !bCode) {
      toast({ title: 'Missing Details', description: 'Enter account number and select a bank.', variant: 'destructive' })
      return
    }
    try {
      setVerifyingBankAccount(true)
      const res = await fetch('/api/organizer/wallet/resolve-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber: acctNum, bankCode: bCode }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Unable to verify bank account')
      const resolvedName = typeof payload.accountName === 'string' ? payload.accountName.trim() : ''
      setVerifiedBankAccount({ accountNumber: acctNum, bankCode: bCode, accountName: resolvedName || accountName.trim() })
      if (resolvedName) setAccountName(resolvedName)
      toast({ title: 'Account Verified', description: resolvedName ? `Verified as ${resolvedName}.` : 'Bank account verified.' })
    } catch (err: any) {
      setVerifiedBankAccount(null)
      toast({ title: 'Verification Failed', description: err.message || 'Could not verify.', variant: 'destructive' })
    } finally {
      setVerifyingBankAccount(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-64 bg-[hsl(var(--legacy-bg-card))] rounded-3xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-8 md:p-12 space-y-8 md:space-y-10">

      <div>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-6">
          <ArrowLeft size={16} />
          Back
        </button>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-3">
          <CreditCard className="text-[hsl(var(--gold))]" size={26} />
          Withdraw — {event?.title || 'Event'}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {isTicketing ? 'Ticketing revenue' : 'Voting revenue'} for this event only.
        </p>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-2xl p-5">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Your Revenue</div>
          <div className="text-2xl font-bold text-gold">GHS {netEarnings.toFixed(2)}</div>
        </div>
        <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-2xl p-5">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Withdrawn</div>
          <div className="text-2xl font-bold text-orange-400">GHS {totalWithdrawn.toFixed(2)}</div>
        </div>
        <div className="bg-[hsl(var(--legacy-bg-card))] border border-[hsl(var(--gold))]/30 rounded-2xl p-5">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Available</div>
          <div className="text-2xl font-bold text-emerald-400">GHS {available.toFixed(2)}</div>
        </div>
      </div>

      {/* Withdrawal form */}
      <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Request Withdrawal</h2>

        {available <= 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            No funds available to withdraw from this event yet.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <DSInput
            type="number" min="0" step="0.01"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount (GHS)"
            className="rounded-lg px-3 text-sm"
          />
          <DSSelect
            value={withdrawMethod}
            onChange={(e) => setWithdrawMethod(e.target.value)}
            className="rounded-lg px-3 text-sm"
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="mobile_money">Mobile Money</option>
          </DSSelect>
          <Button
            onClick={handleWithdraw}
            disabled={submitting || loadingOptions || available <= 0}
            className="w-full"
          >
            {submitting ? 'Submitting…' : 'Request Withdrawal'}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DSInput
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Recipient name"
            className="rounded-lg px-3 text-sm"
          />

          {withdrawMethod === 'bank_transfer' ? (
            <>
              <DSInput
                value={bankAccountNumber}
                onChange={(e) => { setBankAccountNumber(e.target.value); setVerifiedBankAccount(null) }}
                placeholder="Bank account number"
                className="rounded-lg px-3 text-sm"
              />
              <DSSelect
                value={selectedBankCode}
                onChange={(e) => { setSelectedBankCode(e.target.value); setVerifiedBankAccount(null) }}
                className="rounded-lg px-3 text-sm"
                disabled={loadingOptions}
              >
                <option value="">{loadingOptions ? 'Loading banks…' : 'Select bank'}</option>
                {bankOptions.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </DSSelect>
              <Button type="button" variant="secondary" onClick={verifyBankAccount} disabled={loadingOptions || verifyingBankAccount} className="md:col-span-2">
                {verifyingBankAccount ? 'Verifying…' : 'Verify Bank Account'}
              </Button>
              {verifiedBankAccount && (
                <div className="md:col-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Verified: {verifiedBankAccount.accountName} ({maskValue(verifiedBankAccount.accountNumber)})
                </div>
              )}
            </>
          ) : (
            <>
              <DSInput
                value={mobileMoneyNumber}
                onChange={(e) => setMobileMoneyNumber(e.target.value)}
                placeholder="Mobile money number"
                className="rounded-lg px-3 text-sm"
              />
              <DSSelect
                value={selectedMobileMoneyCode}
                onChange={(e) => setSelectedMobileMoneyCode(e.target.value)}
                className="rounded-lg px-3 text-sm"
                disabled={loadingOptions}
              >
                <option value="">{loadingOptions ? 'Loading…' : 'Select network'}</option>
                {mobileMoneyOptions.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
              </DSSelect>
            </>
          )}
        </div>
      </div>

      {/* Withdrawal history for this event */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Withdrawal History</h2>
        {withdrawals.length === 0 ? (
          <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-2xl p-10 text-center text-muted-foreground text-sm">
            No withdrawals for this event yet.
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-2xl p-5 flex justify-between items-center">
                <div>
                  <div className="font-semibold">GHS {Number(w.amount_requested).toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground capitalize mt-0.5">{(w.method || '').replace('_', ' ')}</div>
                  <div className="text-xs text-muted-foreground/70 mt-1">{new Date(w.created_at).toLocaleString()}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                  w.processed_at ? 'bg-emerald-500/20 text-emerald-400'
                  : w.status === 'approved' ? 'bg-gold/20 text-gold'
                  : w.status === 'rejected' ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/5 text-muted-foreground'
                }`}>
                  {w.processed_at ? 'paid out' : w.status || 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
