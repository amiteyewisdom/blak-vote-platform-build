"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWithdrawals()
  }, [])

  const fetchWithdrawals = async () => {
    const { data } = await supabase
      .from("withdrawals")
      .select(`
        *,
        events (
          title
        )
      `)
      .order("created_at", { ascending: false })

    if (data) setWithdrawals(data)
    setLoading(false)
  }

  const approveWithdrawal = async (id: string) => {
    await supabase
      .from("withdrawals")
      .update({ status: "approved" })
      .eq("id", id)

    fetchWithdrawals()
  }

  if (loading) {
    return <div className="p-8 text-white">Loading withdrawals...</div>
  }

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Withdrawal Requests</h1>

      <div className="space-y-4">
        {withdrawals.map(w => (
          <div
            key={w.id}
            className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl"
          >
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">
                  {w.events?.title}
                </h3>
                <p className="text-sm text-neutral-400">
                  Method: {w.method}
                </p>
                <p className="text-sm text-neutral-400">
                  Status: {w.status}
                </p>
              </div>

              <div className="text-right">
                <div className="text-yellow-400 font-bold mb-2">
                  GHS {w.amount}
                </div>

                {w.status !== "approved" && (
                  <button
                    onClick={() => approveWithdrawal(w.id)}
                    className="bg-yellow-500 text-black px-4 py-1 rounded-lg font-semibold"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
