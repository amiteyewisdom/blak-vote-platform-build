import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')?.trim().toLowerCase() || null
  const phone = searchParams.get('phone')?.trim() || null

  if (!email && !phone) {
    return NextResponse.json({ error: 'Provide email or phone' }, { status: 400 })
  }

  try {
    const adminSupabase = getSupabaseAdminClient()

    let query = adminSupabase
      .from('payments')
      .select('id, reference, status, amount, created_at, voter_email, voter_phone, voter_name, event_id, metadata')
      .in('status', ['paid', 'success', 'successful', 'completed'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (email && phone) {
      query = query.or(`voter_email.ilike.${email},voter_phone.eq.${phone}`)
    } else if (email) {
      query = query.ilike('voter_email', email)
    } else if (phone) {
      query = query.eq('voter_phone', phone)
    }

    const { data: payments, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const eventIds = [...new Set((payments || []).map((p: any) => p.event_id).filter(Boolean))]
    const { data: events } = eventIds.length > 0
      ? await adminSupabase.from('events').select('id, title').in('id', eventIds)
      : { data: [] }

    const eventMap = new Map((events || []).map((e: any) => [e.id, e.title]))

    const history = (payments || []).map((p: any) => {
      const meta = typeof p.metadata === 'string' ? (() => { try { return JSON.parse(p.metadata) } catch { return {} } })() : (p.metadata || {})
      return {
        id: p.id,
        reference: p.reference,
        amount: Number(p.amount || 0),
        created_at: p.created_at,
        voter_name: p.voter_name || meta.buyerName || meta.voterName || null,
        event_title: eventMap.get(p.event_id) || meta.eventTitle || null,
        resource: meta.paymentFor === 'ticket' ? 'ticket' : 'vote',
        ticket_codes: Array.isArray(meta.ticketCodes) ? meta.ticketCodes : meta.ticketCode ? [meta.ticketCode] : [],
        candidate_name: meta.candidateName || null,
      }
    })

    return NextResponse.json({ history })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load history' }, { status: 500 })
  }
}
