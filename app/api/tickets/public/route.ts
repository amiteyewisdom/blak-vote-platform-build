import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tickets')
      .select('id, event_id, name, price, quantity, sold_count, admin_fee, created_at')
      .eq('event_id', eventId)
      .or('ticket_kind.eq.plan,and(ticket_kind.is.null,parent_ticket_id.is.null,payment_reference.is.null)')
      .order('price', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tickets = (data || []).map((plan) => {
      const totalQuantity = Math.max(1, Number(plan.quantity || 1))
      const soldCount = Math.max(0, Number(plan.sold_count || 0))
      const remainingQuantity = Math.max(totalQuantity - soldCount, 0)

      return {
        id: plan.id,
        event_id: plan.event_id,
        name: plan.name,
        price: Number(plan.price || 0),
        admin_fee: Number(plan.admin_fee || 0),
        totalQuantity,
        soldCount,
        remainingQuantity,
        isSoldOut: remainingQuantity <= 0,
        created_at: plan.created_at,
      }
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}