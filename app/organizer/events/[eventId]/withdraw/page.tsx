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

    const { data: withdrawData } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (eventData) setEvent(eventData)
    if (withdrawData) setWithdraws(withdrawData)

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-64 bg-[#121421] rounded-3xl animate-pulse" />
      </div>
    )
  }

  const totalRevenue = event?.total_revenue || 0
  const totalWithdrawn = withdraws
    .filter(w => w.status === 'approved')
    .reduce((sum, w) => sum + Number(w.amount), 0)

  const availableBalance = totalRevenue - totalWithdrawn

  return (
    <div className="flex-1 p-12 space-y-12">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white transition mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-4xl font-semibold flex items-center gap-4">
          <CreditCard className="text-[#F5C044]" size={30} />
          Withdrawals
        </h1>
        <p className="text-white/40 mt-3">
          Manage event withdrawals and track payout history.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        <div className="bg-[#121421] border border-white/5 rounded-3xl p-8">
          <div className="text-sm text-white/40 mb-2">Total Revenue</div>
          <div className="text-3xl font-bold">GHS {totalRevenue.toFixed(2)}</div>
        </div>

        <div className="bg-[#121421] border border-white/5 rounded-3xl p-8">
          <div className="text-sm text-white/40 mb-2">Total Withdrawn</div>
          <div className="text-3xl font-bold">GHS {totalWithdrawn.toFixed(2)}</div>
        </div>

        <div className="bg-[#121421] border border-[#F5C044]/20 rounded-3xl p-8 shadow-[0_0_40px_rgba(245,192,68,0.1)]">
          <div className="text-sm text-white/40 mb-2">Available Balance</div>
          <div className="text-3xl font-bold text-[#F5C044]">
            GHS {availableBalance.toFixed(2)}
          </div>
        </div>

      </div>

      {/* Withdraw History */}
      <div className="space-y-6">

        <h2 className="text-2xl font-semibold">Withdrawal History</h2>

        {withdraws.length === 0 && (
          <div className="bg-[#121421] border border-white/5 rounded-3xl p-12 text-center text-white/40">
            No withdrawal requests yet.
          </div>
        )}

        {withdraws.map((w) => (
          <div
            key={w.id}
            className="bg-[#121421] border border-white/5 rounded-3xl p-6 flex justify-between items-center"
          >
            <div>
              <div className="text-lg font-semibold">
                GHS {Number(w.amount).toFixed(2)}
              </div>
              <div className="text-sm text-white/40 capitalize">
                {w.method}
              </div>
              <div className="text-xs text-white/30 mt-1">
                {new Date(w.created_at).toLocaleString()}
              </div>
            </div>

            <div>
              <span
                className={`px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
                  ${
                    w.status === 'approved'
                      ? 'bg-[#F5C044] text-black'
                      : w.status === 'rejected'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/10 text-white/60'
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
