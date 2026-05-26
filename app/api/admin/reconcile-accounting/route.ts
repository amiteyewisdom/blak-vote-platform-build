import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

/**
 * POST /api/admin/reconcile-accounting
 *
 * Runs a full recompute of all organizer_wallets rows and the
 * admin_platform_wallet from the admin_revenue_transactions ledger.
 * Safe to call at any time — all functions are idempotent.
 */
export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const adminSupabase = getSupabaseAdminClient()

  // 1. Reconcile every organizer wallet from the ledger.
  const { data: walletRows, error: walletError } = await adminSupabase.rpc(
    'sync_organizer_wallet_from_ledger',
  )

  if (walletError) {
    return NextResponse.json(
      { error: `Organizer wallet sync failed: ${walletError.message}` },
      { status: 500 },
    )
  }

  // 2. Reconcile the admin platform wallet.
  const { error: adminError } = await adminSupabase.rpc(
    'sync_admin_platform_wallet_from_ledger',
  )

  if (adminError) {
    return NextResponse.json(
      { error: `Admin platform wallet sync failed: ${adminError.message}` },
      { status: 500 },
    )
  }

  // 3. Fetch updated admin platform wallet totals for confirmation.
  const { data: platformWallet } = await adminSupabase
    .from('admin_platform_wallet')
    .select('platform_voting_earnings,platform_ticket_earnings,total_platform_earnings,last_updated')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({
    success: true,
    organizers_reconciled: Array.isArray(walletRows) ? walletRows.length : 0,
    platform_wallet:       platformWallet ?? null,
  })
}

/**
 * GET /api/admin/reconcile-accounting
 *
 * Returns a snapshot of the admin_platform_wallet without triggering a sync.
 */
export async function GET(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ['admin'])
  if (!auth.ok) {
    return auth.response
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: platformWallet, error } = await adminSupabase
    .from('admin_platform_wallet')
    .select('platform_voting_earnings,platform_ticket_earnings,total_platform_earnings,last_updated')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ platform_wallet: platformWallet ?? null })
}
