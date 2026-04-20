import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/api-auth"

export async function POST(req: Request) {
  const supabase = await createClient()

  const auth = await requireRole(supabase, ["admin"])
  if (!auth.ok) {
    return auth.response
  }

  const { organizerId } = await req.json()

  if (!organizerId) {
    return NextResponse.json({ error: "Missing organizerId" }, { status: 400 })
  }

  const { error } = await supabase
    .from("users")
    .update({
      status: "active",
      suspended_at: null,
      suspended_reason: null,
    })
    .eq("id", organizerId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
