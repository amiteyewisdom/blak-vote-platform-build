'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronRight, Trophy, Users } from 'lucide-react'

interface CandidateItem {
  id: string
  nominee_name: string
  bio?: string | null
  photo_url?: string | null
  vote_count?: number
  category_id?: string | null
}

interface CategoryItem {
  id: string
  name: string
}

export default function PublicNomineesPage() {
  const params = useParams()
  const eventCode = String(params?.eventId || '')

  const [event, setEvent] = useState<any>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [candidates, setCandidates] = useState<CandidateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (!eventCode) return

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/events/public?code=${eventCode}`)
        const payload = await res.json()

        if (!res.ok || !payload?.event) {
          setLoading(false)
          return
        }

        setEvent(payload.event)
        setCategories(payload.categories || [])
        setCandidates(
          (payload.candidates || []).map((candidate: any) => ({
            id: candidate.id,
            nominee_name: candidate.nominee_name || candidate.name,
            bio: candidate.bio || null,
            photo_url: candidate.photo_url || null,
            vote_count: Number(candidate.vote_count || 0),
            category_id: candidate.category_id || null,
          }))
        )
      } catch (error) {
        console.error('Failed to load nominees page:', error)
      }

      setLoading(false)
    }

    fetchData()
  }, [eventCode])

  const groups = useMemo(() => {
    const grouped = categories.map((category) => ({
      id: String(category.id),
      name: category.name,
      candidates: candidates
        .filter((candidate) => String(candidate.category_id || '') === String(category.id))
        .sort((a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0)),
    }))

    const uncategorized = candidates
      .filter((candidate) => !candidate.category_id)
      .sort((a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0))

    if (uncategorized.length > 0) {
      grouped.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        candidates: uncategorized,
      })
    }

    return grouped.filter((group) => group.candidates.length > 0)
  }, [categories, candidates])

  useEffect(() => {
    if (groups.length === 0) {
      setOpenGroupId(null)
      return
    }

    setOpenGroupId((current) => current ?? groups[0].id)
  }, [groups])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[hsl(var(--gold))]/30 border-t-[hsl(var(--gold))] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading nominees...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Event Not Found</h2>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[hsl(var(--gold))] text-black rounded-2xl font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--legacy-bg-base))] via-[hsl(var(--legacy-bg-surface))] to-[hsl(var(--legacy-bg-base))] text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <Trophy className="w-7 h-7 text-[hsl(var(--gold))]" />
              {event.title}
            </h1>
            <p className="text-muted-foreground mt-2">Nominees by category (open one category at a time).</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/events/${eventCode}`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl hover:border-[hsl(var(--gold))]/40"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Voting
            </Link>
            {event?.public_results_enabled !== false ? (
              <Link
                href={`/events/${eventCode}/results`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--gold))] text-black rounded-xl font-semibold"
              >
                View Results
              </Link>
            ) : null}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-3xl border border-border bg-[hsl(var(--legacy-bg-card))]/60 p-10 text-center text-muted-foreground">
            No nominees available yet.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const isOpen = openGroupId === group.id

              return (
                <div key={group.id} className="rounded-2xl border border-border bg-[hsl(var(--legacy-bg-card))]/70 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenGroupId((current) => (current === group.id ? null : group.id))}
                    className="w-full px-5 py-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-[hsl(var(--gold))]" /> : <ChevronRight className="w-4 h-4 text-[hsl(var(--gold))]" />}
                      {event.image_url ? (
                        <img src={event.image_url} alt={event.title || 'Event'} className="h-8 w-8 rounded-md object-cover border border-border" />
                      ) : (
                        <div className="h-8 w-8 rounded-md border border-border bg-surface/80" />
                      )}
                      <span className="font-semibold text-[hsl(var(--gold))] truncate">{group.name}</span>
                    </div>

                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface/80">
                      <Users className="w-3 h-3" />
                      {group.candidates.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 space-y-3 border-t border-border/60">
                      {group.candidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-xl border border-border/70 bg-background/30 p-4 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-start gap-3">
                            <div className="h-11 w-11 rounded-lg overflow-hidden bg-surface border border-border flex-shrink-0">
                              {candidate.photo_url ? (
                                <img
                                  src={candidate.photo_url}
                                  alt={candidate.nominee_name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-[hsl(var(--gold))]">
                                  {candidate.nominee_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold truncate">{candidate.nominee_name}</h3>
                              {candidate.bio && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{candidate.bio}</p>}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-[hsl(var(--gold))] whitespace-nowrap">
                            {candidate.vote_count || 0} votes
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
