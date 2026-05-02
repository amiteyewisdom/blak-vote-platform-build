import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

function normalizeTicketCode(input: unknown): string {
  return typeof input === 'string' ? input.trim().toUpperCase() : ''
}

function isValidTicketCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6,32}$/.test(code)
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
      .select('id, event_id, parent_ticket_id, ticket_kind, name, ticket_code, status, usage_status, payment_reference, purchased_at, used_at, buyer_name, buyer_email')
      .eq('ticket_code', code)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (data.ticket_kind !== 'issued') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const isPurchased = Boolean(data.payment_reference)
    const status = String(data.status || 'valid').toLowerCase() === 'used' ? 'used' : 'valid'
    const usageStatus = String(data.usage_status || 'unused').toLowerCase() === 'used' ? 'used' : 'unused'
    const alreadyUsed = status === 'used' || usageStatus === 'used'

    return NextResponse.json({
      ticket: {
        ...data,
        status,
        usage_status: usageStatus,
      },
      valid: isPurchased && !alreadyUsed,
      invalid: !isPurchased,
      alreadyUsed,
      message: !isPurchased ? 'Ticket has not been issued' : alreadyUsed ? 'Ticket has already been used' : 'Ticket is valid',
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
      .select('id, ticket_kind, ticket_code, status, usage_status, payment_reference, used_at')
      .eq('ticket_code', code)
      .maybeSingle()

    if (fetchError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.ticket_kind !== 'issued') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (!ticket.payment_reference) {
      return NextResponse.json({ error: 'Ticket is invalid' }, { status: 404 })
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
      .not('payment_reference', 'is', null)
      .eq('status', 'valid')
      .eq('usage_status', 'unused')
      .select('*')
      .maybeSingle()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Ticket could not be marked as used' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      ticket: updated,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
