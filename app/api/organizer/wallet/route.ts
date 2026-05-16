import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { getOrganizerWalletSummaryData } from '@/lib/organizer-wallet'

/**
 * GET /api/organizer/wallet
 *
 * Retrieves wallet summary for the authenticated organizer:
 * - Total revenue across all events
 * - Total paid votes
 * - Platform fees deducted
 * - Net balance (earnings after fees)
 * - Available balance (net - pending withdrawals)
 * - Pending withdrawal amount
 *
 * Requires: organizer role
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const [{ data: feeOverride }, { data: globalSettings }, { data: feeResult }] = await Promise.all([
      adminSupabase
        .from('organizer_fee_overrides')
        .select('platform_fee_percent')
        .eq('organizer_user_id', auth.userId)
        .maybeSingle(),
      adminSupabase
        .from('platform_settings')
        .select('platform_fee_percent')
        .limit(1)
        .maybeSingle(),
      adminSupabase.rpc('get_effective_platform_fee_percent', {
        p_organizer_ref: auth.userId,
      }),
    ])

    const effectivePlatformFeePercent = Number(
      feeResult ?? feeOverride?.platform_fee_percent ?? globalSettings?.platform_fee_percent ?? 10
    )
    const feeSource = feeOverride?.platform_fee_percent != null ? 'custom' : 'default'

    const wallet = await getOrganizerWalletSummaryData(adminSupabase, auth.userId)

    return NextResponse.json(
      {
        ...wallet,
        effective_platform_fee_percent: effectivePlatformFeePercent,
        fee_source: feeSource,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Wallet endpoint error:', error)
    return NextResponse.json({ error: 'Failed to retrieve wallet' }, { status: 500 })
  }
}
