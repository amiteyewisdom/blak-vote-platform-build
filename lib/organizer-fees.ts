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

  const voteDefault = Number(data?.platform_fee_percent)
  const ticketingDefault = Number(data?.ticketing_commission_percent)

  return {
    voteDefault: Number.isFinite(voteDefault) ? voteDefault : 10,
    ticketingDefault: Number.isFinite(ticketingDefault)
      ? ticketingDefault
      : Number.isFinite(voteDefault)
        ? voteDefault
        : 10,
  }
}

export async function getEffectiveVotePlatformFeePercent(
  supabase: SupabaseLike,
  organizerRef: string | null
) {
  if (organizerRef) {
    try {
      const { data: rpcFee } = await supabase.rpc('get_effective_platform_fee_percent', {
        p_organizer_ref: organizerRef,
      })

      if (Number.isFinite(Number(rpcFee))) {
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
      const { data: rpcFee } = await supabase.rpc('get_effective_ticketing_fee_percent', {
        p_organizer_ref: organizerRef,
      })

      if (Number.isFinite(Number(rpcFee))) {
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
