import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'
import { sendTicketConfirmationEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { reference } = await request.json()
    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 })
    }

    const adminSupabase = getSupabaseAdminClient()

    const { data: payment } = await adminSupabase
      .from('payments')
      .select('id, reference, amount, voter_email, voter_name, event_id, metadata, status')
      .eq('reference', reference.trim())
      .maybeSingle()

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (!['paid', 'success', 'successful', 'completed'].includes(payment.status)) {
      return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 })
    }

    const meta = typeof payment.metadata === 'string'
      ? (() => { try { return JSON.parse(payment.metadata) } catch { return {} } })()
      : (payment.metadata || {})

    const toEmail = payment.voter_email || meta.buyerEmail || meta.email || null
    if (!toEmail) {
      return NextResponse.json({ error: 'No email address on file for this payment' }, { status: 400 })
    }

    const ticketCodes: string[] = Array.isArray(meta.ticketCodes) ? meta.ticketCodes : meta.ticketCode ? [meta.ticketCode] : []
    if (ticketCodes.length === 0) {
      return NextResponse.json({ error: 'No ticket codes found for this payment' }, { status: 400 })
    }

    const { data: eventRow } = await adminSupabase
      .from('events')
      .select('title')
      .eq('id', payment.event_id)
      .maybeSingle()

    await sendTicketConfirmationEmail({
      to: toEmail,
      buyerName: String(payment.voter_name || meta.buyerName || 'Valued Customer'),
      eventTitle: String(eventRow?.title || meta.eventTitle || 'Event'),
      ticketName: meta.ticketName || null,
      ticketCodes,
      reference: payment.reference,
      amount: Number(payment.amount || 0),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to resend' }, { status: 500 })
  }
}
