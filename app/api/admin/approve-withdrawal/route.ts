import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/api-auth"
import { attemptPaystackOrganizerWithdrawalPayout } from '@/lib/paystack-payouts'

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ["admin"])
  if (!auth.ok) {
    return auth.response
  }

  const body = await req.json().catch(() => ({}))
  const withdrawalId = body.withdrawalId
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : ''

  if (!withdrawalId) {
    return NextResponse.json({ error: "Missing withdrawalId" }, { status: 400 })
  }

  const { data: withdrawal, error: withdrawalError } = await supabase
    .from("organizer_withdrawals")
    .select("*")
    .eq("id", withdrawalId)
    .single()

  if (withdrawalError || !withdrawal) {
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
  }

  if (withdrawal.status !== "pending") {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from("organizer_withdrawals")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      admin_note: adminNote || withdrawal.admin_note || null,
    })
    .eq("id", withdrawalId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  try {
    const payout = await attemptPaystackOrganizerWithdrawalPayout({
      supabase,
      withdrawal: {
        ...withdrawal,
        status: 'approved',
        admin_note: adminNote || withdrawal.admin_note || null,
      },
      trigger: 'approval',
    })

    return NextResponse.json({ success: true, payoutStatus: payout.status, message: payout.message })
  } catch (error) {
    console.error('Organizer payout attempt failed after approval:', error)
    return NextResponse.json({
      success: true,
      payoutStatus: 'approved',
      message: 'Withdrawal approved, but the Paystack payout attempt failed. Cron retry or manual review is still available.',
    })
  }
}