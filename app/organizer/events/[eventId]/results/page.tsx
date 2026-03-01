'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Trophy } from 'lucide-react'

export default function ResultsPage() {
  const { eventId } = useParams()
  const router = useRouter()

  const [categories, setCategories] = useState<any[]>([])
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('live-results')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'candidates',
          filter: `event_id=eq.${eventId}`,
        },
        () => fetchData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchData = async () => {
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .eq('event_id', eventId)

    const { data: candData } = await supabase
      .from('candidates')
      .select('*')
      .eq('event_id', eventId)

    if (catData) setCategories(catData)
    if (candData) setCandidates(candData)

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-64 bg-[#121421] rounded-3xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-12 space-y-16">

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
          <Trophy className="text-[#F5C044]" size={32} />
          Live Results
        </h1>
        <p className="text-white/40 mt-3">
          Real-time leaderboard with automatic updates.
        </p>
      </div>

      {/* Categories */}
      <div className="space-y-16">

        {categories.map((category) => {
          const categoryCandidates = candidates
            .filter((c) => c.category_id === category.id)
            .sort((a, b) => b.vote_count - a.vote_count)

          const maxVotes =
            categoryCandidates.length > 0
              ? categoryCandidates[0].vote_count
              : 1

          return (
            <div key={category.id} className="space-y-8">

              <h2 className="text-2xl font-semibold text-[#F5C044]">
                {category.name}
              </h2>

              {categoryCandidates.length === 0 && (
                <div className="bg-[#121421] border border-white/5 rounded-3xl p-12 text-center text-white/40">
                  No nominees yet.
                </div>
              )}

              <div className="space-y-6">

                {categoryCandidates.map((candidate, index) => {
                  const percentage =
                    (candidate.vote_count / maxVotes) * 100

                  const isWinner = index === 0

                  return (
                    <div
                      key={candidate.id}
                      className={`relative bg-[#121421] border rounded-3xl p-6 transition ${
                        isWinner
                          ? 'border-[#F5C044] shadow-[0_0_60px_rgba(245,192,68,0.2)]'
                          : 'border-white/5'
                      }`}
                    >

                      {/* Background Progress */}
                      <div
                        className="absolute left-0 top-0 h-full rounded-3xl bg-gradient-to-r from-[#F5C044]/20 to-transparent transition-all duration-700"
                        style={{ width: `${percentage}%` }}
                      />

                      <div className="relative flex justify-between items-center">

                        <div className="flex items-center gap-5">

                          <div className="text-xl font-bold w-8 text-white/40">
                            #{index + 1}
                          </div>

                          <div className="w-16 h-16 rounded-full overflow-hidden border border-white/10 bg-[#0F111A]">
                            {candidate.photo_url ? (
                              <img
                                src={candidate.photo_url}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
                                —
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-lg font-semibold">
                              {isWinner && '👑 '}
                              {candidate.name}
                            </div>
                            <div className="text-xs text-white/40">
                              Code: {candidate.voting_code}
                            </div>
                          </div>

                        </div>

                        <div className="text-right">
                          <div className="text-xl font-bold">
                            {candidate.vote_count} votes
                          </div>
                          <div className="text-sm text-white/40">
                            GHS {candidate.revenue}
                          </div>
                        </div>

                      </div>

                    </div>
                  )
                })}

              </div>

            </div>
          )
        })}

      </div>

    </div>
  )
}
