import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ensureEventOwnedByOrganizer, requireRole } from "@/lib/api-auth"
import { getSupabaseAdminClient } from "@/lib/server-security"

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

  const adminSupabase = getSupabaseAdminClient()

  const ownershipError = await ensureEventOwnedByOrganizer(adminSupabase, eventId, auth.userId)
  if (ownershipError) {
    return ownershipError
  }

  const { data: eventData, error: eventError } = await adminSupabase
    .from("events")
    .select("short_code, event_code, start_date, end_date")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !eventData) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  const publicCode = eventData.short_code || eventData.event_code || null
  const now = new Date()

  // If start_date is missing, default to now. If end_date is missing, default to 30 days from now.
  const startDate = eventData.start_date || now.toISOString()
  const endDate = eventData.end_date || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error: publishError } = await adminSupabase
    .from("events")
    .update({
      status: "pending",
      is_active: false,
      event_code: publicCode,
      start_date: startDate,
      end_date: endDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)

  if (publishError) {
    return NextResponse.json({ error: publishError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
