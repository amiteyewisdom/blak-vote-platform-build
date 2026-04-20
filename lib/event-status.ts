export const PUBLIC_EVENT_STATUSES = ['active', 'pending', 'published'] as const
export const LIVE_EVENT_STATUSES = PUBLIC_EVENT_STATUSES
export const VOTING_OPEN_EVENT_STATUSES = ['active'] as const

export function isPublicEventStatus(status: string | null | undefined) {
  if (!status) {
    return false
  }

  return PUBLIC_EVENT_STATUSES.includes(status as (typeof PUBLIC_EVENT_STATUSES)[number])
}

export function isLiveEventStatus(status: string | null | undefined) {
  return isPublicEventStatus(status)
}

export function isVotingOpenStatus(status: string | null | undefined) {
  if (!status) {
    return false
  }

  return VOTING_OPEN_EVENT_STATUSES.includes(status as (typeof VOTING_OPEN_EVENT_STATUSES)[number])
}
