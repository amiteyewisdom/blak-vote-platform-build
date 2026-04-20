export type ResultCategory = {
  id: string
  name: string
}

export type ResultCandidate = {
  id: string
  name: string
  photoUrl: string | null
  categoryId: string | null
  totalVotes: number
  paidVotes?: number
  manualVotes?: number
  revenue?: number
}

export type RankedCandidate = ResultCandidate & {
  rank: number
  medal: string | null
  progressPercent: number
}

export type CandidateGroup = {
  id: string
  name: string
  candidates: RankedCandidate[]
}

function getMedal(rank: number): string | null {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

export function rankCandidates(candidates: ResultCandidate[]): RankedCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.totalVotes - a.totalVotes)
  const maxVotes = sorted.length > 0 ? Math.max(1, sorted[0].totalVotes) : 1

  return sorted.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    medal: getMedal(index + 1),
    progressPercent: (candidate.totalVotes / maxVotes) * 100,
  }))
}

export function buildCategoryGroups(
  categories: ResultCategory[],
  candidates: ResultCandidate[]
): CandidateGroup[] {
  const categoryGroups: CandidateGroup[] = categories.map((category) => {
    const categoryCandidates = candidates.filter((candidate) => candidate.categoryId === category.id)
    return {
      id: category.id,
      name: category.name,
      candidates: rankCandidates(categoryCandidates),
    }
  })

  const uncategorized = rankCandidates(candidates.filter((candidate) => !candidate.categoryId))
  if (uncategorized.length > 0) {
    categoryGroups.push({
      id: 'uncategorized',
      name: 'Uncategorized',
      candidates: uncategorized,
    })
  }

  return categoryGroups
}
