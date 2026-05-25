'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSSelect } from '@/components/ui/design-system'
import { Wallet, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TransferOption {
  code: string
  name: string
}

interface EventEarning {
  event_id: string
  event_title?: string
  event_type: string
  total_votes: number
  paid_votes: number
  free_votes: number
  paid_ticket_count: number
  vote_revenue: number
  ticket_revenue: number
  total_revenue: number
  platform_fee_percent: number
  net_earnings: number
  vote_net_earnings: number
  ticket_net_earnings: number
  withdrawn_vote_revenue: number
  withdrawn_ticket_revenue: number
  cashed_out_amount: number
  revenue_left: number
  updated_at: string
}

interface WithdrawalHistoryItem {
  id: number
  amount_requested: number
  platform_fee_amount: number
  net_amount: number
  method: string
  account_details?: Record<string, unknown> | null
  status: string
  requested_at: string
  approved_at?: string | null
  processed_at?: string | null
  payout_provider?: string | null
  payout_reference?: string | null
  payout_attempted_at?: string | null
  payout_failure_reason?: string | null
}

type VerifiedBankAccount = {
  accountNumber: string
  bankCode: string
  accountName: string
}

function maskValue(value: string | null) {
  if (!value) {
    return null
  }

  if (value.length <= 4) {
    return value
  }

  return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`
}

export default function OrganizerWalletPage() {
  const { toast } = useToast()
  const router = useRouter()

  // Orphaned = events that are deleted/cancelled but still have revenue_left > 0
  const [orphanedEarnings, setOrphanedEarnings] = useState<EventEarning[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalHistoryItem[]>([])
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
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      setLoading(true)

      const [dashRes, earningsRes, withdrawalsRes, optionsRes] = await Promise.all([
        fetch('/api/organizer/dashboard', { cache: 'no-store' }),
        fetch('/api/organizer/wallet/events'),
        fetch('/api/organizer/wallet/withdrawals?limit=50'),
        fetch('/api/organizer/wallet/withdrawal-options'),
      ])

      if (dashRes.ok && earningsRes.ok) {
        const dashData = await dashRes.json().catch(() => ({}))
        const earningsData = await earningsRes.json().catch(() => ({}))

        const deletedStatuses = ['deleted', 'cancelled']
        const deletedIds = new Set(
          (dashData.events || [])
            .filter((e: any) => deletedStatuses.includes(String(e.status || '').toLowerCase()))
            .map((e: any) => String(e.id))
        )

        const orphaned = (earningsData.earnings || []).filter(
          (e: EventEarning) => deletedIds.has(e.event_id) && Number(e.revenue_left || 0) > 0
        )
        setOrphanedEarnings(orphaned)
      }

      if (withdrawalsRes.ok) {
        const wd = await withdrawalsRes.json().catch(() => ({}))
        setWithdrawals(wd.withdrawals || [])
      }

      if (optionsRes.ok) {
        const od = await optionsRes.json().catch(() => ({}))
        setBankOptions(Array.isArray(od.banks) ? od.banks : [])
        setMobileMoneyOptions(Array.isArray(od.mobileMoney) ? od.mobileMoney : [])
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load wallet data', variant: 'destructive' })
    } finally {
      setLoading(false)
      setLoadingOptions(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const totalOrphaned = orphanedEarnings.reduce((s, e) => s + Number(e.revenue_left || 0), 0)

  const handleWithdraw = async () => {
    if (totalOrphaned <= 0) {
      toast({ title: 'No Orphaned Funds', description: 'No recoverable funds available.', variant: 'destructive' })
      return
    }

    const parsedAmount = Number(withdrawAmount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Enter a valid withdrawal amount',
        variant: 'destructive',
      })
      return
    }

    if (parsedAmount > totalOrphaned) {
      toast({ title: 'Insufficient Balance', description: 'Amount exceeds available orphaned funds.', variant: 'destructive' })
      return
    }

    const trimmedAccountName = accountName.trim()
    if (!trimmedAccountName) {
      toast({
        title: 'Missing Account Name',
        description: 'Enter the recipient name for this withdrawal.',
        variant: 'destructive',
      })
      return
    }

    const isMobileMoney = withdrawMethod === 'mobile_money'
    const destinationNumber = (isMobileMoney ? mobileMoneyNumber : bankAccountNumber).trim()
    const destinationCode = (isMobileMoney ? selectedMobileMoneyCode : selectedBankCode).trim()

    if (!destinationNumber) {
      toast({
        title: isMobileMoney ? 'Missing Mobile Money Number' : 'Missing Account Number',
        description: isMobileMoney ? 'Enter the mobile money number to receive the payout.' : 'Enter the bank account number to receive the payout.',
        variant: 'destructive',
      })
      return
    }

    if (!destinationCode) {
      toast({
        title: isMobileMoney ? 'Missing Mobile Money Provider' : 'Missing Bank',
        description: isMobileMoney ? 'Select the mobile money network for this payout.' : 'Select the destination bank for this payout.',
        variant: 'destructive',
      })
      return
    }

    if (
      !isMobileMoney &&
      (!verifiedBankAccount ||
        verifiedBankAccount.accountNumber !== destinationNumber ||
        verifiedBankAccount.bankCode !== destinationCode)
    ) {
      toast({
        title: 'Verify Account First',
        description: 'Verify the bank account before submitting this withdrawal request.',
        variant: 'destructive',
      })
      return
    }

    const parsedAccountDetails: Record<string, unknown> = {
      name: isMobileMoney ? trimmedAccountName : verifiedBankAccount?.accountName || trimmedAccountName,
      account_name: isMobileMoney ? trimmedAccountName : verifiedBankAccount?.accountName || trimmedAccountName,
      account_number: destinationNumber,
      bank_code: destinationCode,
      currency: 'GHS',
      ...(isMobileMoney ? { paystackRecipientType: 'mobile_money' } : { paystackRecipientType: 'ghipss' }),
    }

    try {
      setSubmittingWithdraw(true)

      const res = await fetch('/api/organizer/wallet/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parsedAmount,
          method: withdrawMethod,
          accountDetails: parsedAccountDetails,
          withdrawalType: 'combined',
          orphanedEventIds: orphanedEarnings.map((e) => e.event_id),
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to request withdrawal')

      toast({ title: 'Withdrawal Submitted', description: `GHS ${parsedAmount.toFixed(2)} withdrawal request submitted.` })

      setWithdrawAmount('')
      setAccountName('')
      setBankAccountNumber('')
      setSelectedBankCode('')
      setMobileMoneyNumber('')
      setSelectedMobileMoneyCode('')
      setVerifiedBankAccount(null)

      await fetchData()
    } catch (error: any) {
      toast({ title: 'Withdrawal Error', description: error.message || 'Failed to request withdrawal', variant: 'destructive' })
    } finally {
      setSubmittingWithdraw(false)
    }
  }

  const verifyBankAccount = async () => {
    const accountNumber = bankAccountNumber.trim()
    const bankCode = selectedBankCode.trim()

    if (!accountNumber || !bankCode) {
      toast({
        title: 'Missing Bank Details',
        description: 'Enter an account number and choose a bank before verifying.',
        variant: 'destructive',
      })
      return
    }

    try {
      setVerifyingBankAccount(true)
      const response = await fetch('/api/organizer/wallet/resolve-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountNumber, bankCode }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to verify bank account')
      }

      const resolvedAccountName = typeof payload.accountName === 'string' ? payload.accountName.trim() : ''
      setVerifiedBankAccount({
        accountNumber,
        bankCode,
        accountName: resolvedAccountName || accountName.trim(),
      })
      if (resolvedAccountName) {
        setAccountName(resolvedAccountName)
      }

      toast({
        title: 'Bank Account Verified',
        description: resolvedAccountName ? `Account verified as ${resolvedAccountName}.` : 'Bank account verified successfully.',
      })
    } catch (error: any) {
      setVerifiedBankAccount(null)
      toast({
        title: 'Verification Failed',
        description: error.message || 'Unable to verify bank account.',
        variant: 'destructive',
      })
    } finally {
      setVerifyingBankAccount(false)
    }
  }

  const fmt = (n: number) => `GHS ${Number(n).toFixed(2)}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-8">
      <div>
        <button onClick={() => router.push('/organizer')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4 text-sm">
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <Wallet className="text-gold" size={28} /> Orphaned Funds
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          These are unwithdawn funds from events that have been deleted or cancelled. Withdraw them here.
        </p>
      </div>

      {/* Total orphaned funds banner */}
      <div className="rounded-2xl border border-border/70 bg-[hsl(var(--legacy-bg-card))] p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recoverable Funds</div>
          <div className={`text-3xl font-bold ${totalOrphaned > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {fmt(totalOrphaned)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">From {orphanedEarnings.length} deleted/cancelled event{orphanedEarnings.length !== 1 ? 's' : ''}</div>
        </div>
        {totalOrphaned > 0 && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            Withdrawal available
          </span>
        )}
      </div>

      {/* Orphaned events list */}
      {orphanedEarnings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white/2 p-10 text-center">
          <Wallet className="mx-auto mb-3 text-muted-foreground/40" size={36} />
          <p className="text-muted-foreground">No recoverable funds. Deleted events with unwithdawn balances will appear here.</p>
          <p className="text-xs text-muted-foreground/60 mt-2">To withdraw from a live event, go to that event's Manage → Withdraw page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orphanedEarnings.map((e) => (
            <div key={e.event_id} className="rounded-2xl border border-border/70 bg-[hsl(var(--legacy-bg-card))] p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">{e.event_title || `Event ${e.event_id.slice(0, 8)}`}</div>
                <div className="text-xs text-muted-foreground mt-0.5 capitalize">{e.event_type} · deleted</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-emerald-400">{fmt(Number(e.revenue_left || 0))}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">available</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawal form — only shown when there are orphaned funds */}
      {totalOrphaned > 0 && (
        <div className="rounded-2xl border border-border/70 bg-[hsl(var(--legacy-bg-card))] p-6 space-y-4">
          <h2 className="text-lg font-semibold">Recover Funds</h2>
          <p className="text-xs text-muted-foreground">Total available: {fmt(totalOrphaned)}</p>

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
            <Button onClick={handleWithdraw} disabled={submittingWithdraw || loadingOptions} className="w-full">
              {submittingWithdraw ? 'Submitting…' : 'Request Withdrawal'}
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
      )}

      {/* Withdrawal history */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Withdrawal History</h2>
        {withdrawals.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-[hsl(var(--legacy-bg-card))] p-8 text-center text-sm text-muted-foreground">
            No withdrawal history yet.
          </div>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="rounded-2xl border border-border/70 bg-[hsl(var(--legacy-bg-card))] p-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{fmt(Number(w.amount_requested || 0))}</div>
                  <div className="text-xs text-muted-foreground capitalize mt-0.5">{(w.method || '').replace('_', ' ')}</div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">{new Date(w.requested_at).toLocaleString()}</div>
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
