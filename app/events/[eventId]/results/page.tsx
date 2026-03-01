"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Trophy } from "lucide-react"

export default function PublicResultsPage() {
  const { eventId } = useParams()

  const [event, setEvent] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()

    // Realtime updates
    const channel = supabase
      .channel("public-live-results")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidates",
          filter: `event_id=eq.${eventId}`
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchData = async () => {
    const { data: eventData } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single()

    const { data: catData } = await supabase
      .from("categories")
      .select("*")
      .eq("event_id", eventId)

    const { data: candData } = await supabase
      .from("candidates")
      .select("*")
      .eq("event_id", eventId)

    if (eventData) setEvent(eventData)
    if (catData) setCategories(catData)
    if (candData) setCandidates(candData)

    setLoading(false)
  }

  if (loading) return <div className="p-10 text-center text-white">Loading...</div>

  if (!event) return <div className="p-10 text-center text-red-500">Event not found</div>

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">

      <div className="max-w-4xl mx-auto">

        {/* Event Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-yellow-500 flex items-center justify-center gap-2">
            <Trophy size={28} />
            {event.title}
          </h1>
          <p className="text-neutral-400 mt-2">{event.description}</p>
        </div>

        {/* Results */}
        <div className="space-y-12">

          {categories.map((category) => {
            const categoryCandidates = candidates
              .filter((c) => c.category_id === category.id)
              .sort((a, b) => b.vote_count - a.vote_count)

            return (
              <div key={category.id}>

                <h2 className="text-xl font-semibold mb-6 text-yellow-400">
                  {category.name}
                </h2>

                {categoryCandidates.length === 0 && (
                  <p className="text-neutral-500">No nominees yet.</p>
                )}

                <div className="space-y-4">

                  {categoryCandidates.map((candidate, index) => (
                    <div
                      key={candidate.id}
                      className={`flex justify-between items-center p-5 rounded-xl border ${
                        index === 0
                          ? "bg-yellow-500/10 border-yellow-500"
                          : "bg-neutral-900 border-neutral-800"
                      }`}
                    >
                      <div className="flex items-center gap-4">

                        {candidate.photo_url && (
                          <img
                            src={candidate.photo_url}
                            className="w-14 h-14 rounded-full object-cover"
                          />
                        )}

                        <div>
                          <h3 className="font-semibold">
                            {index === 0 && "👑 "}
                            {candidate.name}
                          </h3>
                          <p className="text-sm text-neutral-400">
                            Code: {candidate.voting_code}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {candidate.vote_count} votes
                        </p>
                      </div>
                    </div>
                  ))}

                </div>
              </div>
            )
          })}

        </div>

      </div>
    </div>
  )
}
