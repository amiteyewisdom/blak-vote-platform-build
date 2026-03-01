'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function VotesPage() {
  const params = useParams()
  const eventId = String(params?.eventId || params?.id)

  const [votes, setVotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVotes()
  }, [])

  const fetchVotes = async () => {
    const { data } = await supabase
      .from('votes')
      .select(`
        *,
        nominees(name)
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (data) setVotes(data)
    setLoading(false)
  }

  const totalRevenue = votes.reduce(
    (sum, v) => sum + Number(v.amount_paid),
    0
  )

  const totalVotes = votes.reduce(
    (sum, v) => sum + v.votes_count,
    0
  )

  if (loading)
    return (
      <div className="p-12">
        <div className="h-40 bg-[#121421] rounded-3xl animate-pulse" />
      </div>
    )

  return (
    <div className="p-6 md:p-12 space-y-10">

      <h1 className="text-3xl font-semibold">
        Votes & Revenue
      </h1>

      {/* Metrics */}
      <div className="grid md:grid-cols-3 gap-6">

        <MetricCard
          title="Total Votes"
          value={totalVotes.toString()}
        />

        <MetricCard
          title="Total Revenue"
          value={`GHS ${totalRevenue.toFixed(2)}`}
        />

        <MetricCard
          title="Transactions"
          value={votes.length.toString()}
        />

      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-[#121421] rounded-3xl border border-white/5">

        <table className="w-full text-left">
          <thead className="text-white/40 text-sm border-b border-white/5">
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
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="p-4">
                  {vote.nominees?.name}
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
                <td className="p-4 text-white/40">
                  {new Date(vote.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>

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
    <div className="bg-[#121421] border border-white/5 rounded-3xl p-6">
      <div className="text-white/40 text-sm mb-2">
        {title}
      </div>
      <div className="text-2xl font-bold">
        {value}
      </div>
    </div>
  )
}