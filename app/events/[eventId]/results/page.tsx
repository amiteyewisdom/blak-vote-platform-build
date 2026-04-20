"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { buildCategoryGroups, type ResultCandidate, type ResultCategory } from "@/lib/results-utils"
import PublicNav from "../../../../components/PublicNav"

export default function PublicResultsPage() {
  const { eventId } = useParams()
  const eventCode = String(eventId || "")

  const [event, setEvent] = useState<any>(null)
  const [categories, setCategories] = useState<ResultCategory[]>([])
  const [candidates, setCandidates] = useState<ResultCandidate[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventCode) return
    void fetchData()
  }, [eventCode])

  const fetchData = async () => {
    setLoading(true)

    const response = await fetch(`/api/events/public?code=${encodeURIComponent(eventCode)}`)
    const payload = await response.json()

    if (!response.ok || !payload?.event) {
      setEvent(null)
      setErrorMessage(payload?.error || 'The event you are looking for does not exist.')
      setLoading(false)
      return
    }

    if (payload.event?.public_results_enabled === false) {
      setEvent(null)
      setErrorMessage('Public results are disabled for this event.')
      setLoading(false)
      return
    }

    setEvent(payload.event)
    setErrorMessage(null)
    setCategories(
      ((payload.categories ?? []) as any[]).map((category) => ({
        id: String(category.id),
        name: String(category.name),
      }))
    )
    setCandidates(
      ((payload.candidates ?? []) as any[]).map((candidate) => ({
        id: String(candidate.id),
        name: String(candidate.nominee_name || candidate.name || "Unknown candidate"),
        photoUrl: candidate.photo_url || null,
        categoryId: candidate.category_id || null,
        totalVotes: Number(candidate.vote_count || 0),
      }))
    )

    setLoading(false)
  }

  const groupedResults = useMemo(() => {
    const grouped = buildCategoryGroups(categories, candidates)
    return grouped.map((group) => ({
      ...group,
      candidates: [...group.candidates].sort((a, b) => b.totalVotes - a.totalVotes),
    }))
  }, [categories, candidates])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
          <p className="mt-4 text-sm text-foreground/60">Loading results...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground">Unavailable</h2>
          <p className="mt-2 text-foreground/60">{errorMessage || 'The event you are looking for does not exist.'}</p>
        </div>
      </div>
    )
  }

  const heroImage = event.banner_url || event.image_url || ""
  const badgeImage = event.image_url || event.logo_url || event.banner_url || ""
  const subtitle = event.description || event.title

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <section
        className="relative min-h-[44vh] overflow-hidden"
        style={{
          backgroundImage: heroImage
            ? `linear-gradient(rgba(17,24,39,0.56), rgba(17,24,39,0.56)), url(${heroImage})`
            : "linear-gradient(135deg, #2f3542, #1f2937)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="relative mx-auto flex min-h-[44vh] max-w-4xl flex-col items-center justify-end px-5 pb-12 pt-10 text-center text-white">
          <div className="h-20 w-20 overflow-hidden rounded-full border-[3px] border-white/90 bg-black/35 shadow-[0_10px_28px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24">
            {badgeImage ? (
              <img src={badgeImage} alt="Event logo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.12em] text-white/80">Event</div>
            )}
          </div>

          <h1 className="mt-6 text-5xl font-bold tracking-[-0.02em] sm:text-6xl">{event.title}</h1>
          <p className="mt-2 text-2xl font-medium text-white/92 sm:text-3xl">{subtitle}</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-14">
        <h2 className="text-center text-[2rem] font-semibold tracking-[-0.015em] text-foreground sm:text-[2.2rem]">
          Voting Results
        </h2>

        {groupedResults.every((group) => group.candidates.length === 0) ? (
          <div className="mt-8 rounded-xl border border-border bg-card px-6 py-10 text-center text-muted-foreground">
            No results yet.
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {groupedResults.map((group) => (
              <section key={group.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-card-foreground sm:text-lg">{group.name}</h3>
                </div>

                {group.candidates.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">No candidates in this category.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {group.candidates.map((candidate, index) => (
                      <li key={candidate.id} className="flex items-center gap-4 px-5 py-5 sm:px-6">
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-border bg-muted/40">
                          {candidate.photoUrl ? (
                            <img src={candidate.photoUrl} alt={candidate.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted-foreground">N/A</div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[1.02rem] font-medium uppercase tracking-[0.01em] leading-tight text-foreground sm:text-[1.1rem]">
                            {index + 1}. {candidate.name}
                          </p>
                        </div>

                        <p className="text-2xl font-bold tabular-nums text-foreground sm:text-[1.75rem]">
                          {candidate.totalVotes.toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
