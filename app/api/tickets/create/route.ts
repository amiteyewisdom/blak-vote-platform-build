import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

const ticketPlanSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().min(0).max(1000000),
  quantity: z.coerce.number().int().min(1).max(100000),
})

const ticketPlanUpdateSchema = z.object({
  ticketId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  quantity: z.coerce.number().int().min(1).max(100000).optional(),
})

const ticketPlanDeleteSchema = z.object({
  ticketId: z.string().uuid(),
})

type AuthorizedActor = {
  ok: true
  userId: string
  role: 'admin' | 'organizer'
}

function extractBearerToken(req?: NextRequest): string | null {
  if (!req) {
    return null
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length).trim()
  return token || null
}

async function requireRoleFromBearer(req?: NextRequest): Promise<AuthorizedActor | null> {
  const token = extractBearerToken(req)
  if (!token) {
    return null
  }

  const supabase = getSupabaseAdminClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return null
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (actorError || !actor?.role) {
    return null
  }

  const role = String(actor.role)
  if (role !== 'admin' && role !== 'organizer') {
    return null
  }

  return {
    ok: true,
    userId: user.id,
    role,
  }
}

async function authorizeEventAccess(eventId: string, req?: NextRequest) {
  const sessionClient = await createServerClient()
  let auth = await requireRole(sessionClient, ['admin', 'organizer'])

  if (!auth.ok) {
    const bearerAuth = await requireRoleFromBearer(req)
    if (bearerAuth) {
      auth = bearerAuth
    }
  }

  if (!auth.ok) {
    return auth
  }

  const supabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(supabase, eventId, auth.userId)
    if (ownershipError) {
      return {
        ok: false as const,
        response: ownershipError,
      }
    }
  }

  return {
    ok: true as const,
    auth,
    supabase,
  }
}

async function getTicketCommissionPercent(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const { data: settings, error } = await supabase
    .from('platform_settings')
    .select('ticketing_commission_percent')
    .limit(1)
    .maybeSingle()

  if (error) {
    return 0
  }

  return Number(settings?.ticketing_commission_percent ?? 0)
}

function isMissingColumnError(error: unknown, columnName: string) {
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const message = String(maybeError?.message || '').toLowerCase()
  const details = String(maybeError?.details || '').toLowerCase()
  const hint = String(maybeError?.hint || '').toLowerCase()
  const schemaCacheMiss = maybeError?.code === 'PGRST204' || message.includes('schema cache')
  const mentionsColumn = message.includes('column') && message.includes(columnName.toLowerCase())
  const detailsMentionColumn = details.includes(columnName.toLowerCase())
  const hintMentionsColumn = hint.includes(columnName.toLowerCase())

  return maybeError?.code === '42703' || schemaCacheMiss || mentionsColumn || detailsMentionColumn || hintMentionsColumn
}

function migrationRequiredResponse() {
  return NextResponse.json(
    {
      error: 'Database migration required',
      details: 'Ticket plan schema is outdated. Apply migration 20260411093000_ticket_plan_schema_compatibility.sql.',
      migration: '20260411093000_ticket_plan_schema_compatibility.sql',
    },
    { status: 503 }
  )
}

function isConnectivityError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string } | null
  const message = String(maybeError?.message || '').toLowerCase()
  const details = String(maybeError?.details || '').toLowerCase()

  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    details.includes('failed to fetch') ||
    details.includes('network')
  )
}

function serviceUnavailableResponse() {
  return NextResponse.json(
    {
      error: 'Service temporarily unavailable',
      details: 'Unable to reach Supabase. Check your internet connection and try again.',
    },
    { status: 503 }
  )
}

function legacyTicketTypeSchemaResponse() {
  return NextResponse.json(
    {
      error: 'Database schema is incompatible with ticket plans',
      details: 'The live tickets table enforces a legacy ticket_type requirement/constraint. Apply migration 20260411093000_ticket_plan_schema_compatibility.sql and retry.',
      migration: '20260411093000_ticket_plan_schema_compatibility.sql',
      code: 'LEGACY_TICKET_TYPE_CONSTRAINT',
    },
    { status: 503 }
  )
}

function isLegacyTicketTypeSchemaError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const message = String(maybeError?.message || '').toLowerCase()
  const details = String(maybeError?.details || '').toLowerCase()
  const hint = String(maybeError?.hint || '').toLowerCase()

  return (
    message.includes('ticket_type') ||
    details.includes('ticket_type') ||
    hint.includes('ticket_type')
  )
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const access = await authorizeEventAccess(eventId, req)
    if (!access.ok) {
      return access.response
    }

    const { supabase } = access
    const { data: plans, error } = await supabase
      .from('tickets')
      .select('id, event_id, name, price, quantity, sold_count, admin_fee, created_at, updated_at')
      .eq('event_id', eventId)
      .eq('ticket_kind', 'plan')
      .order('created_at', { ascending: false })

    if (error && isConnectivityError(error)) {
      return serviceUnavailableResponse()
    }

    if (error && !isMissingColumnError(error, 'ticket_kind') && !isMissingColumnError(error, 'sold_count')) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (error && (isMissingColumnError(error, 'ticket_kind') || isMissingColumnError(error, 'sold_count'))) {
      return migrationRequiredResponse()
    }

    const normalizedPlans = plans || []
    const planIds = normalizedPlans.map((plan) => plan.id)
    let usedCounts = new Map<string, number>()

    if (planIds.length > 0) {
      const { data: issuedRows, error: issuedError } = await supabase
        .from('tickets')
        .select('parent_ticket_id, usage_status')
        .in('parent_ticket_id', planIds)
        .eq('ticket_kind', 'issued')

      if (issuedError) {
        if (isConnectivityError(issuedError)) {
            return serviceUnavailableResponse()
        }

        return NextResponse.json({ error: issuedError.message }, { status: 500 })
      }

      usedCounts = new Map<string, number>()
      for (const row of issuedRows || []) {
        if (String(row.usage_status || 'unused').toLowerCase() !== 'used') {
          continue
        }

        const key = String(row.parent_ticket_id || '')
        usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1)
      }
    }

    const ticketPlans = normalizedPlans.map((plan) => {
      const totalQuantity = Math.max(1, Number(plan.quantity || 1))
      const soldCount = Math.max(0, Number(plan.sold_count || 0))
      const remainingQuantity = Math.max(totalQuantity - soldCount, 0)
      const grossRevenue = Number((Number(plan.price || 0) * soldCount).toFixed(2))
      const platformFees = Number((Number(plan.admin_fee || 0) * soldCount).toFixed(2))

      return {
        ...plan,
        totalQuantity,
        soldCount,
        usedCount: usedCounts.get(plan.id) ?? 0,
        remainingQuantity,
        grossRevenue,
        netRevenue: Number((grossRevenue - platformFees).toFixed(2)),
        isSoldOut: remainingQuantity <= 0,
      }
    })

    // Fetch recent sales (issued tickets) for this event
    let recentSales: Array<{
      id: string
      ticketCode: string | null
      planName: string
      buyer: string
      buyerEmail: string | null
      amount: number
      purchasedAt: string | null
      paymentReference: string | null
    }> = []

    if (planIds.length > 0) {
      const { data: salesRows } = await supabase
        .from('tickets')
        .select('id, ticket_code, name, buyer_name, buyer_email, price, payment_reference, purchased_at, created_at, parent_ticket_id')
        .in('parent_ticket_id', planIds)
        .eq('ticket_kind', 'issued')
        .order('purchased_at', { ascending: false, nullsFirst: false })
        .limit(50)

      recentSales = (salesRows || []).map((row) => ({
        id: String(row.id),
        ticketCode: row.ticket_code ?? null,
        planName: String(row.name || 'Ticket'),
        buyer: String(row.buyer_name || row.buyer_email || 'Anonymous'),
        buyerEmail: row.buyer_email ?? null,
        amount: Number(row.price || 0),
        purchasedAt: row.purchased_at ?? row.created_at ?? null,
        paymentReference: row.payment_reference ?? null,
      }))
    }

    return NextResponse.json({ ticketPlans, recentSales })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ticketPlanSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const access = await authorizeEventAccess(parsed.data.event_id, req)
    if (!access.ok) {
      return access.response
    }

    const { supabase } = access
    const ticketPercent = await getTicketCommissionPercent(supabase)
    const adminFee = Number(((parsed.data.price * ticketPercent) / 100).toFixed(2))
    const ticketType = parsed.data.price > 0 ? 'paid' : 'free'
    const timestamp = new Date().toISOString()

    const { data: createdPlan, error } = await supabase
      .from('tickets')
      .insert({
      event_id: parsed.data.event_id,
      name: parsed.data.name,
      price: parsed.data.price,
      quantity: parsed.data.quantity,
      sold_count: 0,
      admin_fee: adminFee,
      ticket_type: ticketType,
      ticket_kind: 'plan',
      ticket_code: null,
      payment_reference: null,
      status: 'valid',
      usage_status: 'unused',
      created_at: timestamp,
      updated_at: timestamp,
      })
      .select('id, event_id, name, price, quantity, sold_count, admin_fee, created_at, updated_at')
      .single()

    if (error || !createdPlan) {
      if (isConnectivityError(error)) {
        return serviceUnavailableResponse()
      }

      if (isLegacyTicketTypeSchemaError(error)) {
        return legacyTicketTypeSchemaResponse()
      }

      if (isMissingColumnError(error, 'ticket_kind') || isMissingColumnError(error, 'sold_count')) {
        return migrationRequiredResponse()
      }

      const errorCode = (error as { code?: string } | null)?.code
      const errorDetails = (error as { details?: string } | null)?.details
      const errorHint = (error as { hint?: string } | null)?.hint

      const errorMessage = (error as { message?: string } | null)?.message

      return NextResponse.json(
        {
          error: errorMessage || 'Unable to create ticket plan',
          details: errorDetails || null,
          hint: errorHint || null,
          code: errorCode || null,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Ticket plan created successfully',
      ticketPlan: {
        ...createdPlan,
        totalQuantity: Number(createdPlan.quantity || 0),
        soldCount: Number(createdPlan.sold_count || 0),
        remainingQuantity: Number(createdPlan.quantity || 0),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ticketPlanUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data: existingPlan, error: existingError } = await supabase
      .from('tickets')
      .select('id, event_id, quantity, sold_count, ticket_kind')
      .eq('id', parsed.data.ticketId)
      .maybeSingle()

    if (isMissingColumnError(existingError, 'ticket_kind') || isMissingColumnError(existingError, 'sold_count')) {
      return migrationRequiredResponse()
    }

    if (isConnectivityError(existingError)) {
      return serviceUnavailableResponse()
    }

    if (existingError || !existingPlan) {
      return NextResponse.json({ error: 'Ticket plan not found' }, { status: 404 })
    }

    if (existingPlan.ticket_kind !== 'plan') {
      return NextResponse.json({ error: 'Only ticket plans can be updated' }, { status: 409 })
    }

    const access = await authorizeEventAccess(existingPlan.event_id, req)
    if (!access.ok) {
      return access.response
    }

    const nextQuantity = parsed.data.quantity ?? Number(existingPlan.quantity || 0)
    const soldCount = Number(existingPlan.sold_count || 0)

    if (nextQuantity < soldCount) {
      return NextResponse.json({ error: 'Quantity cannot be lower than tickets already sold' }, { status: 409 })
    }

    const ticketPercent = await getTicketCommissionPercent(supabase)
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name
    }

    if (parsed.data.price !== undefined) {
      updates.price = parsed.data.price
      updates.admin_fee = Number(((parsed.data.price * ticketPercent) / 100).toFixed(2))
    }

    if (parsed.data.quantity !== undefined) {
      updates.quantity = parsed.data.quantity
    }

    const { data: updatedPlan, error: updateError } = await supabase
      .from('tickets')
      .update(updates)
      .eq('id', parsed.data.ticketId)
      .eq('ticket_kind', 'plan')
      .select('id, event_id, name, price, quantity, sold_count, admin_fee, created_at, updated_at')
      .single()

    if (updateError || !updatedPlan) {
      if (isConnectivityError(updateError)) {
        return serviceUnavailableResponse()
      }

      return NextResponse.json({ error: updateError?.message || 'Unable to update ticket plan' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Ticket plan updated successfully', ticketPlan: updatedPlan })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ticketPlanDeleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data: existingPlan, error: existingError } = await supabase
      .from('tickets')
      .select('id, event_id, sold_count, ticket_kind')
      .eq('id', parsed.data.ticketId)
      .maybeSingle()

    if (isMissingColumnError(existingError, 'ticket_kind') || isMissingColumnError(existingError, 'sold_count')) {
      return migrationRequiredResponse()
    }

    if (isConnectivityError(existingError)) {
      return serviceUnavailableResponse()
    }

    if (existingError || !existingPlan) {
      return NextResponse.json({ error: 'Ticket plan not found' }, { status: 404 })
    }

    if (existingPlan.ticket_kind !== 'plan') {
      return NextResponse.json({ error: 'Only ticket plans can be deleted' }, { status: 409 })
    }

    const access = await authorizeEventAccess(existingPlan.event_id, req)
    if (!access.ok) {
      return access.response
    }

    if (Number(existingPlan.sold_count || 0) > 0) {
      return NextResponse.json({ error: 'Sold ticket plans cannot be deleted' }, { status: 409 })
    }

    const { error: deleteError } = await supabase
      .from('tickets')
      .delete()
      .eq('id', parsed.data.ticketId)
      .eq('ticket_kind', 'plan')

    if (deleteError) {
      if (isConnectivityError(deleteError)) {
        return serviceUnavailableResponse()
      }

      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Ticket plan deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}