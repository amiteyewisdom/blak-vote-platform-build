import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

function normalizeTicketCode(input: unknown): string {
  return typeof input === 'string' ? input.trim().toUpperCase() : ''
}

function isValidTicketCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6,32}$/.test(code)
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length).trim()
  return token || null
}

type AuthorizedActor = {
  ok: true
  userId: string
  role: 'admin' | 'organizer'
}

async function requireRoleFromBearer(req: NextRequest): Promise<AuthorizedActor | null> {
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

  return { ok: true, userId: user.id, role }
}

// Only event staff (admin or the owning organizer) may mark a ticket used
// or view buyer PII.
async function authorizeGateAccess(eventId: string, req: NextRequest) {
  const sessionClient = await createServerClient()
  let auth = await requireRole(sessionClient, ['admin', 'organizer'])

  if (!auth.ok) {
    const bearerAuth = await requireRoleFromBearer(req)
    if (bearerAuth) {
      auth = bearerAuth
    }
  }

  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Authentication required to check in tickets' }, { status: 401 }),
    }
  }

  const supabase = getSupabaseAdminClient()

  if (auth.role === 'organizer') {
    const ownershipError = await ensureEventOwnedByOrganizer(supabase, eventId, auth.userId)
    if (ownershipError) {
      return { ok: false as const, response: ownershipError }
    }
  }

  return { ok: true as const, supabase }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    const code = normalizeTicketCode(req.nextUrl.searchParams.get('code'))

    if (!code) {
      return NextResponse.json({ error: 'Ticket code is required' }, { status: 400 })
    }

    if (!isValidTicketCodeFormat(code)) {
      return NextResponse.json({ error: 'Invalid ticket code format' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('id, event_id, parent_ticket_id, ticket_kind, name, ticket_code, status, usage_status, purchased_at, used_at, buyer_name')
      .eq('ticket_code', code)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (data.ticket_kind !== 'issued') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const status = String(data.status || 'valid').toLowerCase() === 'used' ? 'used' : 'valid'
    const usageStatus = String(data.usage_status || 'unused').toLowerCase() === 'used' ? 'used' : 'unused'
    const alreadyUsed = status === 'used' || usageStatus === 'used'
    const isIssued = Boolean(data.purchased_at) || Boolean(data.ticket_code)

    return NextResponse.json({
      ticket: {
        ...data,
        status,
        usage_status: usageStatus,
      },
      valid: isIssued && !alreadyUsed,
      invalid: !isIssued,
      alreadyUsed,
      message: !isIssued ? 'Ticket has not been issued' : alreadyUsed ? 'Ticket has already been used' : 'Ticket is valid',
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    const body = await req.json()
    const code = normalizeTicketCode(body?.code)

    if (!code) {
      return NextResponse.json({ error: 'Ticket code is required' }, { status: 400 })
    }

    if (!isValidTicketCodeFormat(code)) {
      return NextResponse.json({ error: 'Invalid ticket code format' }, { status: 400 })
    }

    const { data: ticket, error: fetchError } = await supabase
      .from('tickets')
      .select('id, event_id, ticket_kind, ticket_code, status, usage_status, payment_reference, used_at, name, buyer_name, buyer_email')
      .eq('ticket_code', code)
      .maybeSingle()

    if (fetchError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.ticket_kind !== 'issued') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const access = await authorizeGateAccess(String(ticket.event_id), req)
    if (!access.ok) {
      return access.response
    }

    const currentStatus = String(ticket.status || 'valid').toLowerCase()
    const currentUsage = String(ticket.usage_status || 'unused').toLowerCase()
    if (currentStatus === 'used' || currentUsage === 'used') {
      return NextResponse.json({ error: 'Ticket has already been used' }, { status: 409 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('tickets')
      .update({
        status: 'used',
        usage_status: 'used',
        used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id)
      .eq('status', 'valid')
      .eq('usage_status', 'unused')
      .select('*')
      .maybeSingle()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Ticket could not be marked as used' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      ticket: {
        ...updated,
        name: ticket.name ?? null,
        buyer_name: ticket.buyer_name ?? null,
        buyer_email: ticket.buyer_email ?? null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
