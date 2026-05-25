import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { ensureEventOwnedByOrganizer, requireRole } from "@/lib/api-auth"

export async function POST(req: Request) {
  const sessionClient = await createClient()

  const auth = await requireRole(sessionClient, ["organizer"])
  if (!auth.ok) {
    return auth.response
  }

  const { eventId } = await req.json()

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
  }

  const adminSupabase = createSupabaseClient(url, serviceKey)

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  // Transfer any unwithdrawn revenue to organizer's transferable balance
  const { data: transferResult, error: transferError } = await adminSupabase.rpc(
    'transfer_event_balance_on_delete',
    { p_event_id: String(eventId), p_organizer_id: auth.userId }
  )

  if (transferError) {
    console.error('Failed to transfer event balance on delete:', transferError)
    // Don't block deletion if transfer fails; log and continue
  }

  const firstAttempt = await adminSupabase
    .from("events")
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .select("id")
    .maybeSingle()

  if (!firstAttempt.error && firstAttempt.data?.id) {
    return NextResponse.json({ success: true })
  }

  const fallbackAttempt = await adminSupabase
    .from("events")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .select("id")
    .maybeSingle()

  if (fallbackAttempt.error || !fallbackAttempt.data?.id) {
    return NextResponse.json(
      { error: fallbackAttempt.error?.message || firstAttempt.error?.message || "Unable to delete event" },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
