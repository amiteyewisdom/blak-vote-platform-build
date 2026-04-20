import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/api-auth"

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ["admin"])
  if (!auth.ok) {
    return auth.response
  }

  const { eventId } = await req.json()

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  }

  // Mark event as deleted instead of cancelled
  const { error } = await supabase
    .from("events")
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}