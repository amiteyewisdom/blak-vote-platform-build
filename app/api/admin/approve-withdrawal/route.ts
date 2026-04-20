import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/api-auth"

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ["admin"])
  if (!auth.ok) {
    return auth.response
  }

  const { withdrawalId } = await req.json()

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

  const { data: override } = await supabase
    .from('organizer_fee_overrides')
    .select('platform_fee_percent')
    .eq('organizer_user_id', withdrawal.organizer_id)
    .maybeSingle()

  const { data: settings, error: settingsError } = await supabase
    .from("platform_settings")
    .select("platform_fee_percent")
    .single()

  if (settingsError || !settings) {
    return NextResponse.json({ error: "Platform settings missing" }, { status: 500 })
  }

  const effectivePercent = Number(override?.platform_fee_percent ?? settings.platform_fee_percent ?? 10)

  const fee = (Number(withdrawal.amount_requested) * effectivePercent) / 100
  const net = Number(withdrawal.amount_requested) - fee

  const { error: updateError } = await supabase
    .from("organizer_withdrawals")
    .update({
      status: "approved",
      platform_fee_amount: fee,
      net_amount: net,
      approved_at: new Date().toISOString(),
    })
    .eq("id", withdrawalId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}