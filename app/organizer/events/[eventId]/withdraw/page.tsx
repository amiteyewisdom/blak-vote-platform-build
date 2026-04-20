'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, CreditCard } from 'lucide-react'

export default function WithdrawPage() {
  const { eventId } = useParams()
  const router = useRouter()

  const [withdraws, setWithdraws] = useState<any[]>([])
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: withdrawData } = user
      ? await supabase
          .from('organizer_withdrawals')
          .select('*')
          .eq('organizer_id', user.id)
          .order('created_at', { ascending: false })
      : { data: null }

    if (eventData) setEvent(eventData)
    if (withdrawData) setWithdraws(withdrawData)

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-64 bg-[hsl(var(--legacy-bg-card))] rounded-3xl animate-pulse" />
      </div>
    )
  }

  const totalRevenue = event?.total_revenue || 0
  const totalWithdrawn = withdraws
    .filter(w => w.status === 'approved')
    .reduce((sum, w) => sum + Number(w.amount_requested), 0)

  const availableBalance = totalRevenue - totalWithdrawn

  return (
    <div className="flex-1 p-4 sm:p-8 md:p-12 space-y-8 md:space-y-12">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold flex items-center gap-4">
          <CreditCard className="text-[hsl(var(--gold))]" size={30} />
          Withdrawals
        </h1>
        <p className="text-muted-foreground mt-3">
          Manage event withdrawals and track payout history.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-3xl p-5 sm:p-8">
          <div className="text-3xl font-bold">GHS {totalRevenue.toFixed(2)}</div>
        </div>

        <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-3xl p-5 sm:p-8">
          <div className="text-3xl font-bold">GHS {totalWithdrawn.toFixed(2)}</div>
        </div>

        <div className="bg-[hsl(var(--legacy-bg-card))] border border-[hsl(var(--gold))]/20 rounded-3xl p-5 sm:p-8 shadow-[0_0_40px_hsl(var(--gold)/0.1)]">
          <div className="text-sm text-muted-foreground mb-2">Available Balance</div>
          <div className="text-3xl font-bold text-[hsl(var(--gold))]">
            GHS {availableBalance.toFixed(2)}
          </div>
        </div>

      </div>

      <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Need to initiate a payout?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Withdrawal requests are submitted from your Wallet page.
            {availableBalance > 0
              ? ' You currently have funds available.'
              : ' Once funds are available, the withdrawal form will appear there.'}
          </p>
        </div>

        <button
          onClick={() => router.push('/organizer/wallet')}
          className="px-5 py-2.5 rounded-xl bg-[hsl(var(--gold))] text-black font-semibold hover:opacity-90 transition"
        >
          Initiate Payout
        </button>
      </div>

      {/* Withdraw History */}
      <div className="space-y-6">

        <h2 className="text-2xl font-semibold">Withdrawal History</h2>

        {withdraws.length === 0 && (
          <div className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-3xl p-12 text-center text-muted-foreground">
            No withdrawal requests yet.
          </div>
        )}

        {withdraws.map((w) => (
          <div
            key={w.id}
            className="bg-[hsl(var(--legacy-bg-card))] border border-border/70 rounded-3xl p-6 flex justify-between items-center"
          >
            <div>
              <div className="text-lg font-semibold">
                GHS {Number(w.amount_requested).toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground capitalize">
                {w.method}
              </div>
              <div className="text-xs text-muted-foreground/80 mt-1">
                {new Date(w.created_at).toLocaleString()}
              </div>
            </div>

            <div>
              <span
                className={`px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
                  ${
                    w.status === 'approved'
                      ? 'bg-[hsl(var(--gold))] text-black'
                      : w.status === 'rejected'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-surface/80 text-muted-foreground'
                  }`}
              >
                {w.status || 'pending'}
              </span>
            </div>
          </div>
        ))}

      </div>

    </div>
  )
}
