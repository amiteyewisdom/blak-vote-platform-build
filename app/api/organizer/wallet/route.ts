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

    const { getEffectiveTicketingFeePercent, getEffectiveVotePlatformFeePercent } = await import(
      '@/lib/organizer-fees'
    )

    const [{ data: feeOverride }, effectiveVoteFeePercent, effectiveTicketingFeePercent] =
      await Promise.all([
        adminSupabase
          .from('organizer_fee_overrides')
          .select('platform_fee_percent, ticketing_fee_percent')
          .eq('organizer_user_id', auth.userId)
          .maybeSingle(),
        getEffectiveVotePlatformFeePercent(adminSupabase, auth.userId),
        getEffectiveTicketingFeePercent(adminSupabase, auth.userId),
      ])

    const voteFeeSource = feeOverride?.platform_fee_percent != null ? 'custom' : 'default'
    const ticketingFeeSource = feeOverride?.ticketing_fee_percent != null ? 'custom' : 'default'

    const wallet = await getOrganizerWalletSummaryData(adminSupabase, auth.userId)

    const {
      platform_fees_deducted: _platformFeesDeducted,
      vote_platform_fees_deducted: _votePlatformFeesDeducted,
      ticket_platform_fees_deducted: _ticketPlatformFeesDeducted,
      ...walletWithoutFeeAmounts
    } = wallet

    return NextResponse.json(
      {
        ...walletWithoutFeeAmounts,
        effective_platform_fee_percent: effectiveVoteFeePercent,
        effective_ticketing_fee_percent: effectiveTicketingFeePercent,
        vote_fee_source: voteFeeSource,
        ticketing_fee_source: ticketingFeeSource,
        fee_source: voteFeeSource,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Wallet endpoint error:', error)
    return NextResponse.json({ error: 'Failed to retrieve wallet' }, { status: 500 })
  }
}
