"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useToast } from "@/hooks/use-toast"

interface Withdrawal {
  id: string
  organizer_id?: string
  amount_requested?: number
  method?: string
  status: string
  platform_fee_amount?: number
  net_amount?: number
  admin_note?: string
  created_at: string
}

interface AdminEarning {
  id: string
  platform_fee_amount: number
  created_at: string
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
  availableBalance: number
  pendingAmount: number
  processedAmount: number
}

export default function AdminWithdrawalsPage() {
  const { toast } = useToast()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [earnings, setEarnings] = useState<AdminEarning[]>([])
  const [platformWithdrawals, setPlatformWithdrawals] = useState<PlatformWithdrawal[]>([])
  const [platformSummary, setPlatformSummary] = useState<PlatformWithdrawalSummary>({
    totalPlatformRevenue: 0,
    availableBalance: 0,
    pendingAmount: 0,
    processedAmount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
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

      const [{ data: withdrawalsData }, { data: earningData }, platformResponse] = await Promise.all([
        supabase
          .from("organizer_withdrawals")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("admin_revenue_transactions")
          .select("id, platform_fee_amount, created_at")
          .order("created_at", { ascending: false }),
        fetch("/api/admin/platform-withdrawals?limit=50", { cache: "no-store" }),
      ])

      if (!platformResponse.ok) {
        const payload = await platformResponse.json().catch(() => ({}))
        throw new Error(payload?.error || "Failed to load platform withdrawals")
      }

      const platformPayload = await platformResponse.json().catch(() => ({}))

      if (withdrawalsData) setWithdrawals(withdrawalsData as Withdrawal[])
      if (earningData) setEarnings(earningData as AdminEarning[])
      setPlatformWithdrawals(
        Array.isArray(platformPayload?.withdrawals) ? platformPayload.withdrawals as PlatformWithdrawal[] : []
      )
      setPlatformSummary({
        totalPlatformRevenue: Number(platformPayload?.summary?.total_platform_revenue || 0),
        availableBalance: Number(platformPayload?.availableBalance || 0),
        pendingAmount: Number(platformPayload?.pendingAmount || 0),
        processedAmount: Number(platformPayload?.processedAmount || 0),
      })
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
        title: "Organizer withdrawal approved",
        description: "The organizer request is now marked as approved.",
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
  const approvedCount = withdrawals.filter((w) => w.status === "approved").length
  const totalPlatformIncome = earnings.reduce((sum, earning) => sum + Number(earning.platform_fee_amount || 0), 0)

  return (
    <div className="p-4 md:p-8 text-foreground space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Withdrawal Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review organizer requests and manage admin payouts from platform earnings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Pending Requests</p>
          <p className="text-2xl font-semibold mt-1">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Approved Requests</p>
          <p className="text-2xl font-semibold mt-1">{approvedCount}</p>
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
          <p className="text-sm text-muted-foreground">Approve organizer withdrawals after validating the payout.</p>
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
                  <WithdrawalStatus status={w.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Platform Fee: GHS {Number(w.platform_fee_amount || 0).toFixed(2)}
                </p>
              </div>

              <div className="text-left md:text-right md:min-w-[220px]">
                <div className="text-yellow-400 font-bold text-lg mb-2">
                  GHS {Number(w.amount_requested ?? 0).toFixed(2)}
                </div>

                {w.status === 'approved' && (
                  <p className="text-xs text-emerald-400 mb-2">Approved</p>
                )}

                {w.status !== "approved" && (
                  <button
                    onClick={() => approveWithdrawal(w.id)}
                    disabled={processingId === w.id}
                    className="min-h-10 bg-gradient-to-br from-gold to-gold-deep text-gold-foreground px-4 py-2 rounded-xl font-semibold hover:brightness-110 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingId === w.id ? "Approving..." : "Approve"}
                  </button>
                )}
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

  if (status === 'processed') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">PROCESSED</span>
  }

  if (status === 'pending') {
    return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-yellow-500/20 text-yellow-300 border-yellow-500/30">PENDING</span>
  }

  return <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-white/10 text-foreground/70 border-white/20 uppercase">{status || 'unknown'}</span>
}
