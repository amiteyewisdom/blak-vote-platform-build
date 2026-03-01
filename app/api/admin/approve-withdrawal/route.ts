import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const supabase = await createClient()

  const { withdrawalId } = await req.json()

  const { data: withdrawal, error: withdrawalError } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("id", withdrawalId)
    .single()

  if (withdrawalError || !withdrawal) {
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
  }

  if (withdrawal.status !== "pending") {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 })
  }

  const { data: settings, error: settingsError } = await supabase
    .from("platform_settings")
    .select("platform_fee_percent")
    .single()

  if (settingsError || !settings) {
    return NextResponse.json({ error: "Platform settings missing" }, { status: 500 })
  }

  const fee =
    (withdrawal.amount * settings.platform_fee_percent) / 100

  const net = withdrawal.amount - fee

  await supabase
    .from("withdrawals")
    .update({
      status: "approved",
      platform_fee: fee,
      net_amount: net,
      approved_at: new Date(),
    })
    .eq("id", withdrawalId)

  await supabase.from("admin_earnings").insert({
    withdrawal_id: withdrawalId,
    organizer_id: withdrawal.organizer_id,
    amount: fee,
  })

  return NextResponse.json({ success: true })
}