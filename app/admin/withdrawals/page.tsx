"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface Withdrawal {
  id: string
  organizer_id?: string
  amount_requested?: number
  method?: string
  account_details?: Record<string, unknown> | null
  status: string
  platform_fee_amount?: number
  net_amount?: number
  admin_note?: string
  created_at: string
  approved_at?: string | null
  processed_at?: string | null
  payout_provider?: string | null
  payout_reference?: string | null
  payout_failure_reason?: string | null
  payout_metadata?: Record<string, unknown> | null
}

interface PlatformWithdrawal {
  id: number
  requested_by_user_id: string
  amount_requested: number
  method: string
  status: string
  admin_note?: string | null
  requested_at: string
  processed_at?: string | null
  created_at: string
}

interface PlatformWithdrawalSummary {
  totalPlatformRevenue: number
  totalGrossRevenue: number
  availableBalance: number
  pendingAmount: number
  processedAmount: number
}

export default function AdminWithdrawalsPage() {
  const { toast } = useToast()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [platformWithdrawals, setPlatformWithdrawals] = useState<PlatformWithdrawal[]>([])
  const [platformSummary, setPlatformSummary] = useState<PlatformWithdrawalSummary>({
    totalPlatformRevenue: 0,
    totalGrossRevenue: 0,
    availableBalance: 0,
    pendingAmount: 0,
    processedAmount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null)
  const [retryingPayoutId, setRetryingPayoutId] = useState<string | null>(null)
  const [reopeningPayoutId, setReopeningPayoutId] = useState<string | null>(null)
  const [submittingPlatformWithdrawal, setSubmittingPlatformWithdrawal] = useState(false)
  const [processingPlatformId, setProcessingPlatformId] = useState<number | null>(null)
  const [platformAmount, setPlatformAmount] = useState("")
  const [platformMethod, setPlatformMethod] = useState("bank_transfer")
  const [platformAccountDetails, setPlatformAccountDetails] = useState("")

  useEffect(() => {
    fetchWithdrawals()
  }, [])

  const fetchWithdrawals = async () => {
    try {
      setLoading(true)

      const [organizerWithdrawalsResponse, platformResponse] = await Promise.all([
        fetch("/api/admin/withdrawals?limit=200", { cache: "no-store" }),
        fetch("/api/admin/platform-withdrawals?limit=50", { cache: "no-store" }),
      ])

      let nextError: string | null = null

      if (!organizerWithdrawalsResponse.ok) {
        const payload = await organizerWithdrawalsResponse.json().catch(() => ({}))
        nextError = payload?.error || "Failed to load organizer withdrawals"
      } else {
        const organizerWithdrawalsPayload = await organizerWithdrawalsResponse.json().catch(() => ({}))
        setWithdrawals(
          Array.isArray(organizerWithdrawalsPayload?.withdrawals)
            ? organizerWithdrawalsPayload.withdrawals as Withdrawal[]
            : []
        )
      }

      if (!platformResponse.ok) {
        const payload = await platformResponse.json().catch(() => ({}))
        nextError = nextError || payload?.error || "Failed to load platform withdrawals"
      } else {
        const platformPayload = await platformResponse.json().catch(() => ({}))
        setPlatformWithdrawals(
          Array.isArray(platformPayload?.withdrawals) ? platformPayload.withdrawals as PlatformWithdrawal[] : []
        )
        setPlatformSummary({
          totalPlatformRevenue: Number(platformPayload?.summary?.total_platform_revenue || 0),
          totalGrossRevenue: Number(platformPayload?.summary?.total_gross_revenue || 0),
          availableBalance: Number(platformPayload?.availableBalance || 0),
          pendingAmount: Number(platformPayload?.pendingAmount || 0),
          processedAmount: Number(platformPayload?.processedAmount || 0),
        })
      }

      if (nextError) {
        throw new Error(nextError)
      }
    } catch (error: any) {
      toast({
        title: "Failed to load withdrawals",
        description: error?.message || "Try refreshing the page.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const approveWithdrawal = async (id: string) => {
    setProcessingId(id)

    try {
      const response = await fetch("/api/admin/approve-withdrawal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ withdrawalId: id }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to approve withdrawal")
      }

      toast({
        title: payload?.payoutStatus === 'processed' ? 'Organizer payout sent' : 'Organizer withdrawal approved',
        description:
          payload?.message ||
          'The organizer request is approved and remains reserved until payout is completed.',
      })

      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Unable to approve organizer withdrawal.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const processWithdrawal = async (id: string) => {
    setProcessingPayoutId(id)

    try {
      const response = await fetch('/api/admin/process-withdrawal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ withdrawalId: id }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to mark withdrawal processed')
      }

      toast({
        title: 'Organizer payout processed',
        description: 'The organizer withdrawal is now marked as paid out.',
      })

      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: 'Processing failed',
        description: error?.message || 'Unable to mark organizer payout as processed.',
        variant: 'destructive',
      })
    } finally {
      setProcessingPayoutId(null)
    }
  }

  const retryWithdrawal = async (id: string) => {
    setRetryingPayoutId(id)

    try {
      const response = await fetch('/api/admin/retry-withdrawal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ withdrawalId: id }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to retry withdrawal payout')
      }

      toast({
        title: payload?.payoutStatus === 'processed' ? 'Organizer payout sent' : 'Payout retry submitted',
        description: payload?.message || 'The payout retry has been submitted.',
      })

      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: 'Retry failed',
        description: error?.message || 'Unable to retry the organizer payout.',
        variant: 'destructive',
      })
    } finally {
      setRetryingPayoutId(null)
    }
  }

  const reopenWithdrawal = async (id: string) => {
    setReopeningPayoutId(id)

    try {
      const response = await fetch('/api/admin/reopen-withdrawal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ withdrawalId: id }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to reopen withdrawal')
      }

      toast({
        title: 'Withdrawal reopened',
        description: 'This payout was moved back to processing state.',
      })

      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: 'Reopen failed',
        description: error?.message || 'Unable to move this payout back to processing.',
        variant: 'destructive',
      })
    } finally {
      setReopeningPayoutId(null)
    }
  }

  const readAccountDetail = (details: Record<string, unknown> | null | undefined, keys: string[]) => {
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

  const readPayoutMetadataValue = (metadata: Record<string, unknown> | null | undefined, key: string) => {
    if (!metadata || typeof metadata !== 'object') {
      return null
    }

    const value = metadata[key]
    if (value === undefined || value === null) {
      return null
    }

    return String(value)
  }

  const maskValue = (value: string | null) => {
    if (!value) {
      return null
    }

    if (value.length <= 4) {
      return value
    }

    return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`
  }

  const requestPlatformWithdrawal = async () => {
    const amount = Number(platformAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a platform withdrawal amount greater than zero.",
        variant: "destructive",
      })
      return
    }

    if (amount > platformSummary.availableBalance) {
      toast({
        title: "Insufficient balance",
        description: "Amount exceeds the available platform earnings.",
        variant: "destructive",
      })
      return
    }

    let parsedAccountDetails: Record<string, unknown> = {}
    if (platformAccountDetails.trim()) {
      try {
        parsedAccountDetails = JSON.parse(platformAccountDetails)
      } catch {
        toast({
          title: "Invalid account details",
          description: "Account details must be valid JSON.",
          variant: "destructive",
        })
        return
      }
    }

    try {
      setSubmittingPlatformWithdrawal(true)

      const response = await fetch("/api/admin/platform-withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          method: platformMethod,
          accountDetails: parsedAccountDetails,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to request platform withdrawal")
      }

      toast({
        title: "Platform withdrawal requested",
        description: "The payout request has been added to the platform withdrawal queue.",
      })

      setPlatformAmount("")
      setPlatformAccountDetails("")
      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error?.message || "Unable to create platform withdrawal request.",
        variant: "destructive",
      })
    } finally {
      setSubmittingPlatformWithdrawal(false)
    }
  }

  const processPlatformWithdrawal = async (id: number) => {
    try {
      setProcessingPlatformId(id)

      const response = await fetch("/api/admin/platform-withdrawals/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ withdrawalId: id }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to process platform withdrawal")
      }

      toast({
        title: "Platform withdrawal processed",
        description: "The payout is now marked as processed.",
      })

      await fetchWithdrawals()
    } catch (error: any) {
      toast({
        title: "Processing failed",
        description: error?.message || "Unable to mark the platform withdrawal as processed.",
        variant: "destructive",
      })
    } finally {
      setProcessingPlatformId(null)
    }
  }

  if (loading) {
    return <div className="p-4 md:p-8 text-foreground">Loading withdrawals...</div>
  }

  const pendingCount = withdrawals.filter((w) => w.status === "pending").length
  const approvedCount = withdrawals.filter((w) => w.status === "approved" && !w.processed_at).length
  const pendingFundsCount = withdrawals.filter((w) => w.status === 'pending_funds' && !w.processed_at).length
  const processedCount = withdrawals.filter((w) => Boolean(w.processed_at)).length
  const totalPlatformIncome = Number(platformSummary.totalPlatformRevenue || 0)

  return (
    <div className="p-4 md:p-8 text-foreground space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Withdrawal Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review organizer requests and manage admin payouts from platform earnings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Pending Requests</p>
          <p className="text-2xl font-semibold mt-1">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Approved Requests</p>
          <p className="text-2xl font-semibold mt-1">{approvedCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-card p-5">
          <p className="text-sm text-muted-foreground">Waiting For Funds</p>
          <p className="text-2xl font-semibold mt-1 text-amber-300">{pendingFundsCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Processed Requests</p>
          <p className="text-2xl font-semibold mt-1">{processedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-300 bg-card p-5">
          <p className="text-sm text-muted-foreground">Total Platform Gross Revenue</p>
          <p className="text-2xl font-semibold mt-1">
            GHS {platformSummary.totalGrossRevenue.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-gold/30 bg-card p-5">
          <p className="text-sm text-muted-foreground">Platform Income (Fees)</p>
          <p className="text-2xl font-semibold mt-1 text-yellow-400">
            GHS {totalPlatformIncome.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-card p-5">
          <p className="text-sm text-muted-foreground">Available Platform Balance</p>
          <p className="text-2xl font-semibold mt-1 text-emerald-400">
            GHS {platformSummary.availableBalance.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Pending Platform Payouts</p>
          <p className="text-2xl font-semibold mt-1">GHS {platformSummary.pendingAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Processed Platform Payouts</p>
          <p className="text-2xl font-semibold mt-1">GHS {platformSummary.processedAmount.toFixed(2)}</p>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">Organizer Requests</h2>
          <p className="text-sm text-muted-foreground">Approve withdrawals after validating funds. Approval now tries Paystack immediately, and low-balance cases stay queued as pending funds until cron can retry them.</p>
        </div>

        {withdrawals.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface-card p-6 text-center text-muted-foreground md:p-8">
            No organizer withdrawal requests yet.
          </div>
        )}

        {withdrawals.map(w => (
          <div
            key={w.id}
            className="rounded-2xl border border-border bg-card p-4 md:p-5"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Method: {w.method || "N/A"}
                </p>
                <div className="mt-3">
                  <WithdrawalStatus status={w.processed_at ? 'processed' : w.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Platform Fee: GHS {Number(w.platform_fee_amount || 0).toFixed(2)}
                </p>
                {w.approved_at && (
                  <p className="text-xs text-emerald-400">Approved: {new Date(w.approved_at).toLocaleString()}</p>
                )}
                {w.processed_at && (
                  <p className="text-xs text-emerald-400">Processed: {new Date(w.processed_at).toLocaleString()}</p>
                )}
                {w.payout_provider && (
                  <p className="text-xs text-muted-foreground uppercase">Provider: {w.payout_provider}</p>
                )}
                {readAccountDetail(w.account_details, ['account_name', 'name']) && (
                  <p className="text-xs text-muted-foreground">Recipient: {readAccountDetail(w.account_details, ['account_name', 'name'])}</p>
                )}
                {readAccountDetail(w.account_details, ['bank_code']) && (
                  <p className="text-xs text-muted-foreground">Destination: {readAccountDetail(w.account_details, ['bank_code'])} / {maskValue(readAccountDetail(w.account_details, ['account_number'])) || 'N/A'}</p>
                )}
                {w.payout_reference && (
                  <p className="text-xs text-muted-foreground break-all">Reference: {w.payout_reference}</p>
                )}
                {readPayoutMetadataValue(w.payout_metadata, 'paystack_error_code') && !w.processed_at && (
                  <p className="text-xs text-amber-300">Paystack Code: {readPayoutMetadataValue(w.payout_metadata, 'paystack_error_code')}</p>
                )}
                {readPayoutMetadataValue(w.payout_metadata, 'paystack_error_status') && !w.processed_at && (
                  <p className="text-xs text-amber-300">Paystack HTTP Status: {readPayoutMetadataValue(w.payout_metadata, 'paystack_error_status')}</p>
                )}
                {w.payout_failure_reason && !w.processed_at && (
                  <p className="text-xs text-amber-300 max-w-xl">{w.payout_failure_reason}</p>
                )}
              </div>

              <div className="text-left md:text-right md:min-w-[220px]">
                <div className="text-yellow-400 font-bold text-lg mb-2">
                  GHS {Number(w.amount_requested ?? 0).toFixed(2)}
                </div>

                {w.processed_at && (
                  <div className="flex flex-col gap-2 md:items-end mb-2">
                    <p className="text-xs text-emerald-400">Processed</p>
                    <button
                      onClick={() => reopenWithdrawal(w.id)}
                      disabled={reopeningPayoutId === w.id}
                      className="min-h-10 border border-amber-400/50 bg-amber-500/10 text-amber-200 px-4 py-2 rounded-xl font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reopeningPayoutId === w.id ? 'Reopening...' : 'Reopen To Processing'}
                    </button>
                  </div>
                )}

                {w.status === "pending" && (
                  <button
                    onClick={() => approveWithdrawal(w.id)}
                    disabled={processingId === w.id}
                    className="min-h-10 bg-gradient-to-br from-gold to-gold-deep text-gold-foreground px-4 py-2 rounded-xl font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingId === w.id ? "Approving..." : "Approve"}
                  </button>
                )}

                <div className="flex flex-col gap-2 md:items-end">
                  {(w.status === 'approved' || w.status === 'pending_funds') && !w.processed_at && (
                    <button
                      onClick={() => retryWithdrawal(w.id)}
                      disabled={retryingPayoutId === w.id}
                      className="min-h-10 bg-gradient-to-br from-gold to-gold-deep text-gold-foreground px-4 py-2 rounded-xl font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {retryingPayoutId === w.id ? 'Retrying...' : 'Retry Paystack Payout'}
                    </button>
                  )}

                  {(w.status === 'approved' || w.status === 'pending_funds') && !w.processed_at && (
                    <button
                      onClick={() => processWithdrawal(w.id)}
                      disabled={processingPayoutId === w.id}
                      className="min-h-10 border border-border bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingPayoutId === w.id ? 'Processing...' : 'Mark Processed'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">Platform Earnings Payouts</h2>
          <p className="text-sm text-muted-foreground">Request withdrawal of accumulated platform fees, then mark the payout processed once funds are sent.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Total platform earnings collected</p>
            <p className="text-2xl font-semibold text-yellow-400 mt-1">
              GHS {platformSummary.totalPlatformRevenue.toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={platformAmount}
              onChange={(e) => setPlatformAmount(e.target.value)}
              placeholder="Amount (GHS)"
              className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0"
            />
            <select
              value={platformMethod}
              onChange={(e) => setPlatformMethod(e.target.value)}
              className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
            </select>
            <button
              onClick={requestPlatformWithdrawal}
              disabled={submittingPlatformWithdrawal}
              className="min-h-10 bg-gradient-to-br from-gold to-gold-deep text-gold-foreground px-4 py-2 rounded-xl font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingPlatformWithdrawal ? "Submitting..." : "Request Platform Withdrawal"}
            </button>
          </div>

          <textarea
            value={platformAccountDetails}
            onChange={(e) => setPlatformAccountDetails(e.target.value)}
            placeholder='Account details JSON (optional), e.g. {"bank":"GTB","account_number":"0123456789"}'
            className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0"
          />
        </div>

        {platformWithdrawals.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface-card p-6 text-center text-muted-foreground md:p-8">
            No platform payout requests yet.
          </div>
        )}

        <div className="space-y-4">
          {platformWithdrawals.map((withdrawal) => (
            <div
              key={withdrawal.id}
              className="rounded-2xl border border-border bg-card p-4 md:p-5"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Method: {withdrawal.method || "N/A"}
                  </p>
                  <WithdrawalStatus status={withdrawal.status} />
                  <p className="text-xs text-muted-foreground">
                    Requested: {new Date(withdrawal.requested_at).toLocaleString()}
                  </p>
                  {withdrawal.processed_at && (
                    <p className="text-xs text-emerald-400">
                      Processed: {new Date(withdrawal.processed_at).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="text-left md:text-right md:min-w-[220px] space-y-2">
                  <div className="text-emerald-400 font-bold text-lg">
                    GHS {Number(withdrawal.amount_requested || 0).toFixed(2)}
                  </div>

                  {withdrawal.status === "processed" ? (
                    <p className="text-xs text-emerald-400">Processed</p>
                  ) : (
                    <button
                      onClick={() => processPlatformWithdrawal(withdrawal.id)}
                      disabled={processingPlatformId === withdrawal.id}
                      className="min-h-10 border border-border bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingPlatformId === withdrawal.id ? "Processing..." : "Mark Processed"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function WithdrawalStatus({ status }: { status: string }) {
  if (status === 'approved') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">APPROVED</span>
  }

  if (status === 'pending_funds') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-amber-500/20 text-amber-300 border-amber-500/30">PENDING FUNDS</span>
  }

  if (status === 'processed') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">PROCESSED</span>
  }

  if (status === 'pending') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-yellow-500/20 text-yellow-300 border-yellow-500/30">PENDING</span>
  }

  return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-white/10 text-foreground/70 border-white/20 uppercase">{status || 'unknown'}</span>
}
