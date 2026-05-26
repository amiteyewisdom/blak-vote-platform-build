import { getSupabaseAdminClient } from '@/lib/server-security'

type SupabaseLike = {
  from: (table: string) => any
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
}

async function fetchGlobalFeeDefaults(supabase: SupabaseLike) {
  const { data } = await supabase
    .from('platform_settings')
    .select('platform_fee_percent, ticketing_commission_percent')
    .limit(1)
    .maybeSingle()

  const rawVote = data?.platform_fee_percent
  const rawTicket = data?.ticketing_commission_percent

  // Use null-check BEFORE Number() conversion: Number(null) === 0 which is
  // finite and would be treated as an explicit 0% fee — incorrect behaviour.
  const voteDefault = rawVote != null && Number.isFinite(Number(rawVote)) ? Number(rawVote) : 10
  const ticketingDefault =
    rawTicket != null && Number.isFinite(Number(rawTicket))
      ? Number(rawTicket)
      : voteDefault

  return { voteDefault, ticketingDefault }
}

export async function getEffectiveVotePlatformFeePercent(
  supabase: SupabaseLike,
  organizerRef: string | null
) {
  if (organizerRef) {
    try {
      const { data: rpcFee, error: rpcError } = await supabase.rpc('get_effective_platform_fee_percent', {
        p_organizer_ref: organizerRef,
      })

      // Guard: null means RPC failed/returned nothing — do NOT treat as 0%.
      if (!rpcError && rpcFee != null && Number.isFinite(Number(rpcFee))) {
        return Number(rpcFee)
      }
    } catch {
      // Fall through to direct reads.
    }

    const { data: override } = await supabase
      .from('organizer_fee_overrides')
      .select('platform_fee_percent')
      .eq('organizer_user_id', organizerRef)
      .maybeSingle()

    if (override?.platform_fee_percent != null && Number.isFinite(Number(override.platform_fee_percent))) {
      return Number(override.platform_fee_percent)
    }
  }

  const defaults = await fetchGlobalFeeDefaults(supabase)
  return defaults.voteDefault
}

export async function getEffectiveTicketingFeePercent(
  supabase: SupabaseLike,
  organizerRef: string | null
) {
  if (organizerRef) {
    try {
      const { data: rpcFee, error: rpcError } = await supabase.rpc('get_effective_ticketing_fee_percent', {
        p_organizer_ref: organizerRef,
      })

      // Guard: null means RPC failed/returned nothing — do NOT treat as 0%.
      if (!rpcError && rpcFee != null && Number.isFinite(Number(rpcFee))) {
        return Number(rpcFee)
      }
    } catch {
      // Fall through to direct reads.
    }

    const { data: override } = await supabase
      .from('organizer_fee_overrides')
      .select('ticketing_fee_percent')
      .eq('organizer_user_id', organizerRef)
      .maybeSingle()

    if (override?.ticketing_fee_percent != null && Number.isFinite(Number(override.ticketing_fee_percent))) {
      return Number(override.ticketing_fee_percent)
    }
  }

  const defaults = await fetchGlobalFeeDefaults(supabase)
  return defaults.ticketingDefault
}

export async function getGlobalFeeDefaults() {
  const supabase = getSupabaseAdminClient()
  return fetchGlobalFeeDefaults(supabase)
}
