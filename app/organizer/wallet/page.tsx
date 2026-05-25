'use client'

import { useEffect, useState } from 'react'
import MetricCard from '@/components/ui/metric-card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSSelect } from '@/components/ui/design-system'

interface TransferOption {
  code: string
  name: string
}

interface WalletSummary {
  total_revenue: number
  gross_revenue: number
  total_paid_votes: number
  net_balance: number
  available_balance: number
  pending_withdrawals: number
  total_cashed_out: number
  last_updated: string
  effective_platform_fee_percent?: number
  effective_ticketing_fee_percent?: number
  vote_fee_source?: string
  ticketing_fee_source?: string
  fee_source?: 'custom' | 'default'
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

function readAccountDetail(details: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!details || typeof details !== 'object') {
    return null
  }

  for (const key of keys) {
    const value = details[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
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

function getWithdrawalDisplayStatus(item: WithdrawalHistoryItem) {
  if (item.processed_at || item.status === 'processed') {
    return 'successful'
  }

  const normalized = (item.status || '').toLowerCase()

  if (normalized === 'rejected' || normalized === 'cancelled') {
    return 'failed'
  }

  return 'processing'
}

export default function OrganizerWalletPage() {
  const { toast } = useToast()

  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [earnings, setEarnings] = useState<EventEarning[]>([])
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
  const [activeTab, setActiveTab] = useState<'voting' | 'ticketing'>('voting')

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

        const optionsRes = await fetch('/api/organizer/wallet/withdrawal-options')
        if (!optionsRes.ok) {
          throw new Error('Failed to fetch withdrawal options')
        }
        const optionsData = await optionsRes.json()
        setBankOptions(Array.isArray(optionsData.banks) ? optionsData.banks : [])
        setMobileMoneyOptions(Array.isArray(optionsData.mobileMoney) ? optionsData.mobileMoney : [])
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load wallet data',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
        setLoadingOptions(false)
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
          withdrawalType: activeTab === 'ticketing' ? 'ticket' : 'vote',
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to request withdrawal')
      }

      const withdrawalData = payload.withdrawal
      const amountDisplay = `GHS ${parsedAmount.toFixed(2)}`
      const netAmountDisplay = withdrawalData?.net_amount ? `GHS ${Number(withdrawalData.net_amount).toFixed(2)}` : amountDisplay
      
      toast({
        title: '✓ Withdrawal Request Submitted',
        description: `You've requested ${amountDisplay}. Your request is now pending admin review. Once approved, the system will automatically process the payout to your account (${netAmountDisplay} after fees). You'll receive updates on the status.`,
      })

      setWithdrawAmount('')
      setAccountName('')
      setBankAccountNumber('')
      setSelectedBankCode('')
      setMobileMoneyNumber('')
      setSelectedMobileMoneyCode('')
      setVerifiedBankAccount(null)

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
        <p className="text-muted-foreground">Track your net revenue, platform fee rate, and manage withdrawals</p>
      </div>

      {wallet && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Revenue" value={formatCurrency(wallet.total_revenue)} />
          <MetricCard title="Revenue Left" value={formatCurrency(wallet.net_balance)} />
          <MetricCard title="Cashed Out" value={formatCurrency(wallet.total_cashed_out)} />
          <MetricCard title="Reserved" value={formatCurrency(wallet.pending_withdrawals)} />
          <MetricCard title="Available to Request" value={formatCurrency(wallet.available_balance)} />
          <MetricCard title="Paid Votes" value={wallet.total_paid_votes.toLocaleString()} />
          <MetricCard
            title="Vote Platform Fee"
            value={`${Number(wallet.effective_platform_fee_percent || 0).toFixed(2)}%`}
          />
          <MetricCard
            title="Ticketing Commission"
            value={`${Number(wallet.effective_ticketing_fee_percent || 0).toFixed(2)}%`}
          />
          <MetricCard
            title="Last Updated"
            value={new Date(wallet.last_updated).toLocaleDateString()}
          />
        </div>
      )}

      {wallet && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Your fee rates:</span>{' '}
          Vote {Number(wallet.effective_platform_fee_percent || 0).toFixed(2)}%
          {wallet.vote_fee_source === 'custom' ? ' (custom)' : ' (platform default)'}
          {' · '}
          Ticketing {Number(wallet.effective_ticketing_fee_percent || 0).toFixed(2)}%
          {wallet.ticketing_fee_source === 'custom' ? ' (custom)' : ' (platform default)'}
          <div className="mt-2">
            Available to request = net earnings minus withdrawals already requested and still under review or settlement.
          </div>
        </div>
      )}

      {wallet && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold">Withdraw Funds</h2>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setActiveTab('voting')}
                  className={`px-3 py-1.5 font-semibold transition-colors ${activeTab === 'voting' ? 'bg-gold text-black' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                >
                  Events
                </button>
                <button
                  onClick={() => setActiveTab('ticketing')}
                  className={`px-3 py-1.5 font-semibold transition-colors ${activeTab === 'ticketing' ? 'bg-violet-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                >
                  Ticketing
                </button>
              </div>
            </div>
            <p className="text-muted-foreground">Available to request now: {formatCurrency(wallet.available_balance)}
            </p>
            <p className="text-xs text-muted-foreground">
              Requests stay pending until admin validates them. After approval the system attempts a Paystack payout immediately, and low-balance cases wait in pending funds until they can be retried.
            </p>
            {wallet.available_balance <= 0 ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                You do not have withdrawable funds yet. Revenue will appear here once paid votes or ticket sales are posted to your organizer wallet.
              </div>
            ) : null}
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
              disabled={submittingWithdraw || loadingOptions || wallet.available_balance <= 0}
            >
              {submittingWithdraw ? 'Submitting...' : 'Request Withdrawal'}
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
                  onChange={(e) => {
                    setBankAccountNumber(e.target.value)
                    setVerifiedBankAccount(null)
                  }}
                  placeholder="Bank account number"
                  className="rounded-lg px-3 text-sm"
                />
                <DSSelect
                  value={selectedBankCode}
                  onChange={(e) => {
                    setSelectedBankCode(e.target.value)
                    setVerifiedBankAccount(null)
                  }}
                  className="rounded-lg px-3 text-sm"
                  disabled={loadingOptions}
                >
                  <option value="">{loadingOptions ? 'Loading banks...' : 'Select bank'}</option>
                  {bankOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </DSSelect>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={verifyBankAccount}
                  disabled={loadingOptions || verifyingBankAccount}
                  className="md:col-span-2"
                >
                  {verifyingBankAccount ? 'Verifying account...' : 'Verify Bank Account'}
                </Button>
                {verifiedBankAccount && (
                  <div className="md:col-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    Verified account: {verifiedBankAccount.accountName} ({maskValue(verifiedBankAccount.accountNumber)})
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
                  <option value="">{loadingOptions ? 'Loading networks...' : 'Select mobile money network'}</option>
                  {mobileMoneyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </DSSelect>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            The system stores the recipient name, destination number, and Paystack bank or telco code for automatic payout after admin approval.
          </p>
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
                  <th className="pb-3 font-semibold">Method</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {withdrawals.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3">{formatCurrency(Number(item.amount_requested || 0))}</td>
                    <td className="py-3 capitalize">{(item.method || 'bank_transfer').replace('_', ' ')}</td>
                    <td className="py-3 uppercase text-xs">{getWithdrawalDisplayStatus(item)}</td>
                    <td className="py-3">
                      {new Date(item.requested_at).toLocaleString()}
                      {readAccountDetail(item.account_details, ['account_name', 'name']) ? <div className="text-xs text-muted-foreground">Recipient: {readAccountDetail(item.account_details, ['account_name', 'name'])}</div> : null}
                      {readAccountDetail(item.account_details, ['bank_code']) ? <div className="text-xs text-muted-foreground">Destination: {readAccountDetail(item.account_details, ['bank_code'])} / {maskValue(readAccountDetail(item.account_details, ['account_number'])) || 'N/A'}</div> : null}
                      {item.approved_at ? <div className="text-xs text-muted-foreground">Approved: {new Date(item.approved_at).toLocaleString()}</div> : null}
                      {item.payout_attempted_at ? <div className="text-xs text-muted-foreground">Last attempt: {new Date(item.payout_attempted_at).toLocaleString()}</div> : null}
                      {item.processed_at ? <div className="text-xs text-emerald-400">Paid out: {new Date(item.processed_at).toLocaleString()}</div> : null}
                      {item.payout_provider ? <div className="text-xs text-muted-foreground uppercase">Provider: {item.payout_provider}</div> : null}
                      {item.payout_reference ? <div className="text-xs text-muted-foreground break-all">Reference: {item.payout_reference}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold">Earnings Breakdown</h2>
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setActiveTab('voting')}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'voting'
                  ? 'bg-gold text-black'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              Events
            </button>
            <button
              onClick={() => setActiveTab('ticketing')}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'ticketing'
                  ? 'bg-violet-500 text-white'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              Ticketing
            </button>
          </div>
        </div>

        {(() => {
          const filtered = earnings.filter((e) =>
            activeTab === 'ticketing' ? e.event_type === 'ticketing' : e.event_type !== 'ticketing'
          )
          if (filtered.length === 0) {
            return (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-muted-foreground">
                  {activeTab === 'ticketing'
                    ? 'No ticketing revenue yet.'
                    : 'No voting event revenue yet.'}
                </p>
              </div>
            )
          }
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-3 font-semibold">Event</th>
                    {activeTab === 'voting' ? (
                      <th className="pb-3 font-semibold">Votes</th>
                    ) : (
                      <th className="pb-3 font-semibold">Tickets Sold</th>
                    )}
                    <th className="pb-3 font-semibold">Your Revenue</th>
                    <th className="pb-3 font-semibold">Withdrawn</th>
                    <th className="pb-3 font-semibold">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((earning) => {
                    const netEarnings = activeTab === 'ticketing'
                      ? Number(earning.ticket_net_earnings || earning.net_earnings || 0)
                      : Number(earning.vote_net_earnings || earning.net_earnings || 0)
                    const withdrawn = activeTab === 'ticketing'
                      ? Number(earning.withdrawn_ticket_revenue || 0)
                      : Number(earning.withdrawn_vote_revenue || 0)
                    const available = Math.max(netEarnings - withdrawn, 0)
                    return (
                      <tr key={earning.event_id} className="transition hover:bg-muted/30">
                        <td className="py-4">
                          <div className="font-medium text-foreground">
                            {earning.event_title || `Event ${earning.event_id.slice(0, 8)}`}
                          </div>
                        </td>
                        {activeTab === 'voting' ? (
                          <td className="py-4">{Number(earning.total_votes || 0).toLocaleString()}</td>
                        ) : (
                          <td className="py-4">{Number(earning.paid_ticket_count || 0).toLocaleString()}</td>
                        )}
                        <td className="py-4 font-semibold text-gold">{formatCurrency(netEarnings)}</td>
                        <td className="py-4 text-orange-400">{formatCurrency(withdrawn)}</td>
                        <td className="py-4 font-semibold text-emerald-400">{formatCurrency(available)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}
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
              <strong>Fee rates:</strong> Paid votes use {Number(wallet?.effective_platform_fee_percent || 0).toFixed(2)}% and ticket sales use {Number(wallet?.effective_ticketing_fee_percent || 0).toFixed(2)}%.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-green-500">•</span>
            <span>
              <strong>Total Revenue (After Fee):</strong> Lifetime organizer earnings after platform fees
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-500">•</span>
            <span>
              <strong>Reserved:</strong> Withdrawal requests already created and still being reviewed, waiting for Paystack funds, or being settled
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold">•</span>
            <span>
              <strong>Available to Request:</strong> What remains after reserved withdrawals are removed from net earnings
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
