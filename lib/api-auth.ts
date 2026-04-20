import { NextResponse } from "next/server"

type Role = "admin" | "organizer"

type RoleCheckResult =
  | {
      ok: true
      userId: string
      role: Role
    }
  | {
      ok: false
      response: NextResponse
    }

export async function requireRole(
  supabase: any,
  allowedRoles: Role[]
): Promise<RoleCheckResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: actor, error: actorError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (actorError || !actor?.role || !allowedRoles.includes(actor.role as Role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    userId: user.id,
    role: actor.role as Role,
  }
}

export async function ensureEventOwnedByOrganizer(
  adminSupabase: any,
  eventId: string,
  organizerId: string
): Promise<NextResponse | null> {
  const { data: eventData, error: eventError } = await adminSupabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !eventData) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  // Direct match: organizer_id is the user's auth ID
  if (eventData.organizer_id === organizerId) {
    return null
  }

  // Indirect match: organizer_id might be an organizer-record ID linked to this user
  const { data: organizerRecord } = await adminSupabase
    .from("organizers")
    .select("id")
    .eq("user_id", organizerId)
    .maybeSingle()

  if (organizerRecord?.id && organizerRecord.id === eventData.organizer_id) {
    return null
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
