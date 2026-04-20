import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

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

    // Get wallet summary
    const { data: wallet, error: walletError } = await supabase
      .rpc('get_organizer_wallet_summary', {
        p_organizer_id: auth.userId,
      })

    if (walletError) {
      return NextResponse.json({ error: walletError.message }, { status: 500 })
    }

    if (!wallet || wallet.length === 0) {
      // Return default if wallet doesn't exist
      return NextResponse.json(
        {
          total_revenue: 0,
          total_paid_votes: 0,
          platform_fees_deducted: 0,
          net_balance: 0,
          available_balance: 0,
          pending_withdrawals: 0,
          last_updated: new Date().toISOString(),
          effective_platform_fee_percent: effectivePlatformFeePercent,
          fee_source: feeSource,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        ...wallet[0],
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
