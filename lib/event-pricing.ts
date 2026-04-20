type EventPricingFields = {
  vote_price?: number | string | null
  cost_per_vote?: number | string | null
  voting_fee?: number | string | null
}

function toFiniteNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveEventVotePrice(event: EventPricingFields | null | undefined) {
  if (!event) {
    return 0
  }

  return (
    toFiniteNumber(event.vote_price) ??
    toFiniteNumber(event.cost_per_vote) ??
    toFiniteNumber(event.voting_fee) ??
    0
  )
}
