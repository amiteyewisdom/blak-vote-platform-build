'use client'

import { useEffect, useState } from 'react'
import MetricCard from '@/components/ui/metric-card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSSelect, DSTextarea } from '@/components/ui/design-system'

interface WalletSummary {
  total_revenue: number
  total_paid_votes: number
  platform_fees_deducted: number
  net_balance: number
  available_balance: number
  pending_withdrawals: number
  last_updated: string
  effective_platform_fee_percent?: number
  fee_source?: 'custom' | 'default'
}

interface EventEarning {
  event_id: string
  total_votes: number
  paid_votes: number
  free_votes: number
  total_revenue: number
  platform_fee_percent: number
  platform_fee_deducted: number
  net_earnings: number
  updated_at: string
}

interface WithdrawalHistoryItem {
  id: number
  amount_requested: number
  platform_fee_amount: number
  net_amount: number
  method: string
  status: string
  requested_at: string
}

export default function OrganizerWalletPage() {
  const { toast } = useToast()

  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [earnings, setEarnings] = useState<EventEarning[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalHistoryItem[]>([])
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer')
  const [accountDetails, setAccountDetails] = useState('')
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWalletData = async () => {
      try {
        setLoading(true)

        // Fetch wallet summary
        const walletRes = await fetch('/api/organizer/wallet')
        if (!walletRes.ok) {
          throw new Error('Failed to fetch wallet')
        }
        const walletData = await walletRes.json()
        setWallet(walletData)

        // Fetch event earnings
        const earningsRes = await fetch('/api/organizer/wallet/events')
        if (!earningsRes.ok) {
          throw new Error('Failed to fetch earnings')
        }
        const earningsData = await earningsRes.json()
        setEarnings(earningsData.earnings || [])

        const withdrawalsRes = await fetch('/api/organizer/wallet/withdrawals?limit=50')
        if (!withdrawalsRes.ok) {
          throw new Error('Failed to fetch withdrawals')
        }
        const withdrawalsData = await withdrawalsRes.json()
        setWithdrawals(withdrawalsData.withdrawals || [])
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load wallet data',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchWalletData()
  }, [toast])

  const handleWithdraw = async () => {
    if (!wallet || wallet.available_balance <= 0) {
      toast({
        title: 'No Balance',
        description: 'You have no available balance to withdraw',
        variant: 'destructive',
      })
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

    if (parsedAmount > wallet.available_balance) {
      toast({
        title: 'Insufficient Balance',
        description: 'Withdrawal amount exceeds your available balance',
        variant: 'destructive',
      })
      return
    }

    let parsedAccountDetails: Record<string, unknown> = {}
    if (accountDetails.trim()) {
      try {
        parsedAccountDetails = JSON.parse(accountDetails)
      } catch {
        toast({
          title: 'Invalid Account Details',
          description: 'Account details must be valid JSON',
          variant: 'destructive',
        })
        return
      }
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
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to request withdrawal')
      }

      toast({
        title: 'Withdrawal Requested',
        description: 'Your withdrawal request has been submitted for approval.',
      })

      setWithdrawAmount('')
      setAccountDetails('')

      const [walletRes, withdrawalsRes] = await Promise.all([
        fetch('/api/organizer/wallet'),
        fetch('/api/organizer/wallet/withdrawals?limit=50'),
      ])

      if (walletRes.ok) {
        const walletData = await walletRes.json()
        setWallet(walletData)
      }

      if (withdrawalsRes.ok) {
        const withdrawalsData = await withdrawalsRes.json()
        setWithdrawals(withdrawalsData.withdrawals || [])
      }
    } catch (error: any) {
      toast({
        title: 'Withdrawal Error',
        description: error.message || 'Failed to request withdrawal',
        variant: 'destructive',
      })
    } finally {
      setSubmittingWithdraw(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Wallet & Earnings</h1>
        <p className="text-muted-foreground">Track your revenue, platform fees, and manage withdrawals</p>
      </div>

      {wallet && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Revenue" value={formatCurrency(wallet.total_revenue)} />
          <MetricCard title="Platform Fees" value={formatCurrency(wallet.platform_fees_deducted)} />
          <MetricCard title="Net Balance" value={formatCurrency(wallet.net_balance)} />
          <MetricCard title="Available" value={formatCurrency(wallet.available_balance)} />
          <MetricCard title="Paid Votes" value={wallet.total_paid_votes.toLocaleString()} />
          <MetricCard
            title="Your Platform Fee"
            value={`${Number(wallet.effective_platform_fee_percent || 0).toFixed(2)}%`}
          />
          <MetricCard
            title="Last Updated"
            value={new Date(wallet.last_updated).toLocaleDateString()}
          />
        </div>
      )}

      {wallet && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Current Fee Rule:</span>{' '}
          {Number(wallet.effective_platform_fee_percent || 0).toFixed(2)}%{' '}
          {wallet.fee_source === 'custom' ? '(custom fee set by admin for your account)' : '(default platform fee)'}
        </div>
      )}

      {wallet && wallet.available_balance > 0 && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Withdraw Funds</h2>
            <p className="text-muted-foreground"> {formatCurrency(wallet.available_balance)}
            </p>
            <p className="text-xs text-muted-foreground">
              Platform fee is deducted automatically from each request at your current rate of {Number(wallet.effective_platform_fee_percent || 0).toFixed(2)}%.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <DSInput
              type="number"
              min="0"
              step="0.01"
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
              className="w-full"
              disabled={submittingWithdraw}
            >
              {submittingWithdraw ? 'Submitting...' : 'Request Withdrawal'}
            </Button>
          </div>

          <DSTextarea
            value={accountDetails}
            onChange={(e) => setAccountDetails(e.target.value)}
            placeholder='Account details JSON (optional), e.g. {"bank":"GTB","account_number":"0123456789"}'
            className="h-24 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold">Withdrawal History</h2>

        {withdrawals.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No withdrawal requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="pb-3 font-semibold">Requested</th>
                  <th className="pb-3 font-semibold">Fee</th>
                  <th className="pb-3 font-semibold">Net</th>
                  <th className="pb-3 font-semibold">Method</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {withdrawals.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3">{formatCurrency(Number(item.amount_requested || 0))}</td>
                    <td className="py-3 text-orange-400">{formatCurrency(Number(item.platform_fee_amount || 0))}</td>
                    <td className="py-3 text-emerald-400">{formatCurrency(Number(item.net_amount || 0))}</td>
                    <td className="py-3 capitalize">{(item.method || 'bank_transfer').replace('_', ' ')}</td>
                    <td className="py-3 uppercase text-xs">{item.status || 'pending'}</td>
                    <td className="py-3">{new Date(item.requested_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold">Per-Event Breakdown</h2>

        {earnings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No earnings yet. Start creating paid events!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="pb-3 font-semibold">Event ID</th>
                  <th className="pb-3 font-semibold">Total Votes</th>
                  <th className="pb-3 font-semibold">Paid Votes</th>
                  <th className="pb-3 font-semibold">Revenue</th>
                  <th className="pb-3 font-semibold">Platform Fee</th>
                  <th className="pb-3 font-semibold">Net Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {earnings.map((earning) => (
                  <tr key={earning.event_id} className="transition hover:bg-muted/30">
                    <td className="py-4 font-mono text-xs text-gold">
                      {earning.event_id.slice(0, 8)}...
                    </td>
                    <td className="py-4">{earning.total_votes.toLocaleString()}</td>
                    <td className="py-4 font-semibold text-green-400">
                      {earning.paid_votes.toLocaleString()}
                    </td>
                    <td className="py-4 font-semibold">{formatCurrency(earning.total_revenue)}</td>
                    <td className="py-4 text-orange-400">
                      {formatCurrency(earning.platform_fee_deducted)} ({earning.platform_fee_percent}%)
                    </td>
                    <td className="py-4 font-semibold text-blue-400">
                      {formatCurrency(earning.net_earnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-semibold">How Earnings Work</h3>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-gold">•</span>
            <span>
              <strong>Revenue:</strong> Money from paid votes at your vote price
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-orange-500">•</span>
            <span>
              <strong>Platform Fee:</strong> Deducted from revenue using your configured rate ({Number(wallet?.effective_platform_fee_percent || 0).toFixed(2)}%).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-green-500">•</span>
            <span>
              <strong>Net Balance:</strong> Available for withdrawal
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-500">•</span>
            <span>
              <strong>Pending:</strong> Funds requested but not yet transferred
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
