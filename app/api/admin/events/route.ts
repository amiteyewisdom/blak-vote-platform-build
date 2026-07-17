import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/api-auth"

type EventRow = {
  id: string
  organizer_id?: string | null
}

type UserRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  full_name?: string | null
}

type OrganizerRow = {
  id: string
  user_id?: string | null
}

type EventEarningsRow = {
  event_id: string
  total_revenue?: number | string | null
  net_earnings?: number | string | null
  withdrawn_vote_revenue?: number | string | null
  withdrawn_ticket_revenue?: number | string | null
}

function toNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function getAdminSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

function splitFullName(fullName: string | null | undefined) {
  const trimmed = String(fullName || "").trim()
  if (!trimmed) {
    return { first_name: null, last_name: null }
  }

  const parts = trimmed.split(/\s+/)
  const firstName = parts.shift() || null
  const lastName = parts.length > 0 ? parts.join(" ") : null

  return { first_name: firstName, last_name: lastName }
}

export async function GET() {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ["admin"])
  if (!auth.ok) {
    return auth.response
  }

  const adminSupabase = getAdminSupabase()
  if (!adminSupabase) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured" }, { status: 500 })
  }

  const { data: eventRows, error: eventsError } = await adminSupabase
    .from("events")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  const events = (eventRows || []) as EventRow[]
  const eventIds = events.map((event) => event.id).filter(Boolean)
  const organizerRefs = Array.from(new Set(events.map((event) => event.organizer_id).filter((id): id is string => Boolean(id))))

  const eventEarningsByEventId = new Map<string, EventEarningsRow>()
  if (eventIds.length > 0) {
    const { data: earningsRows, error: earningsError } = await adminSupabase
      .from('organizer_event_earnings')
      .select('event_id,total_revenue,net_earnings,withdrawn_vote_revenue,withdrawn_ticket_revenue')
      .in('event_id', eventIds)

    if (!earningsError) {
      for (const row of (earningsRows || []) as EventEarningsRow[]) {
        eventEarningsByEventId.set(String(row.event_id), row)
      }
    }
  }

  const userMap = new Map<string, UserRow>()
  const organizerToUserMap = new Map<string, string>()

  if (organizerRefs.length > 0) {
    const [{ data: usersById, error: usersByIdError }, { data: organizersById, error: organizersByIdError }, { data: organizersByUser, error: organizersByUserError }] = await Promise.all([
      adminSupabase
        .from("users")
        .select("id,first_name,last_name,email,full_name")
        .in("id", organizerRefs),
      adminSupabase
        .from("organizers")
        .select("id,user_id")
        .in("id", organizerRefs),
      adminSupabase
        .from("organizers")
        .select("id,user_id")
        .in("user_id", organizerRefs),
    ])

    if (usersByIdError || organizersByIdError || organizersByUserError) {
      const details = usersByIdError?.message || organizersByIdError?.message || organizersByUserError?.message
      return NextResponse.json({ error: details || "Failed to resolve organizer profiles" }, { status: 500 })
    }

    for (const user of (usersById || []) as UserRow[]) {
      userMap.set(user.id, user)
    }

    for (const row of (organizersById || []) as OrganizerRow[]) {
      if (row.id && row.user_id) {
        organizerToUserMap.set(row.id, row.user_id)
      }
    }

    for (const row of (organizersByUser || []) as OrganizerRow[]) {
      if (row.id && row.user_id) {
        organizerToUserMap.set(row.id, row.user_id)
      }
    }

    const mappedUserIds = Array.from(new Set(Array.from(organizerToUserMap.values()).filter((id) => !userMap.has(id))))

    if (mappedUserIds.length > 0) {
      const { data: mappedUsers, error: mappedUsersError } = await adminSupabase
        .from("users")
        .select("id,first_name,last_name,email,full_name")
        .in("id", mappedUserIds)

      if (mappedUsersError) {
        return NextResponse.json({ error: mappedUsersError.message }, { status: 500 })
      }

      for (const user of (mappedUsers || []) as UserRow[]) {
        userMap.set(user.id, user)
      }
    }
  }

  const enrichedEvents = (eventRows || []).map((event: Record<string, unknown>) => {
    const organizerRef = String(event.organizer_id || "")
    const mappedUserId = organizerRef ? organizerToUserMap.get(organizerRef) : undefined
    const profile = (organizerRef && userMap.get(organizerRef)) || (mappedUserId ? userMap.get(mappedUserId) : undefined)
    const fallbackNames = splitFullName(profile?.full_name)

    const earnings = eventEarningsByEventId.get(String(event.id))
    const totalRevenue = toNumber(earnings?.total_revenue ?? event.total_revenue)
    const totalWithdrawn = toNumber(earnings?.withdrawn_vote_revenue) + toNumber(earnings?.withdrawn_ticket_revenue)
    const availableWithdrawalBalance = Math.max(toNumber(earnings?.net_earnings) - totalWithdrawn, 0)

    return {
      ...event,
      total_revenue: totalRevenue,
      total_withdrawn: totalWithdrawn,
      available_withdrawal_balance: availableWithdrawalBalance,
      profiles: profile
        ? {
            first_name: profile.first_name ?? fallbackNames.first_name,
            last_name: profile.last_name ?? fallbackNames.last_name,
            email: profile.email ?? null,
          }
        : null,
    }
  })

  return NextResponse.json({ events: enrichedEvents })
}