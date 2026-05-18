import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { ensureEventOwnedByOrganizer, requireRole } from "@/lib/api-auth"
import { getOrganizerEventEarningsData } from "@/lib/organizer-wallet"

function toNumber(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

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

  const eventMetrics = await getOrganizerEventEarningsData(adminSupabase as any, auth.userId)
  const targetEventMetrics = eventMetrics.find((item) => String((item as any).event_id || '') === String(eventId)) as Record<string, unknown> | undefined
  const reclaimAmount = Number(toNumber(targetEventMetrics?.revenue_left).toFixed(2))

  if (reclaimAmount > 0) {
    const reclaimPaymentId = `event-delete-reclaim-${eventId}`

    const { error: reclaimError } = await adminSupabase
      .from('admin_revenue_transactions')
      .upsert(
        {
          payment_id: reclaimPaymentId,
          payment_reference: reclaimPaymentId,
          event_id: String(eventId),
          event_title: typeof targetEventMetrics?.event_title === 'string' ? targetEventMetrics.event_title : null,
          organizer_id: auth.userId,
          vote_id: null,
          vote_type: 'reclaimed',
          payment_context: 'reclaimed',
          gross_amount: reclaimAmount,
          platform_fee_percent: 100,
          platform_fee_amount: reclaimAmount,
          organizer_net_amount: 0,
          processed_at: new Date().toISOString(),
        },
        {
          onConflict: 'payment_id',
          ignoreDuplicates: true,
        },
      )

    if (reclaimError) {
      return NextResponse.json(
        { error: `Failed to transfer event balance to admin account: ${reclaimError.message}` },
        { status: 500 }
      )
    }
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
