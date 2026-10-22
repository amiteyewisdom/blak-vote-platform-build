import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const baseColumns = 'id, event_id, name, price, quantity, sold_count, admin_fee, created_at'

    let { data, error } = await supabase
      .from('tickets')
      .select(`${baseColumns}, description, reserved_count`)
      .eq('event_id', eventId)
      .or('ticket_kind.eq.plan,and(ticket_kind.is.null,parent_ticket_id.is.null,payment_reference.is.null)')
      .order('price', { ascending: true })
      .order('created_at', { ascending: true })

    // Older databases without the newer columns still list plans.
    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (message.includes('description') || message.includes('reserved_count') || error.code === '42703' || error.code === 'PGRST204') {
        const retry = await supabase
          .from('tickets')
          .select(baseColumns)
          .eq('event_id', eventId)
          .or('ticket_kind.eq.plan,and(ticket_kind.is.null,parent_ticket_id.is.null,payment_reference.is.null)')
          .order('price', { ascending: true })
          .order('created_at', { ascending: true })

        data = (retry.data || []).map((plan) => ({ ...plan, description: null, reserved_count: 0 }))
        error = retry.error
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tickets = (data || []).map((plan) => {
      const totalQuantity = Math.max(1, Number(plan.quantity || 1))
      const soldCount = Math.max(0, Number(plan.sold_count || 0))
      const reservedCount = Math.max(0, Number(plan.reserved_count || 0))
      const remainingQuantity = Math.max(totalQuantity - soldCount - reservedCount, 0)

      return {
        id: plan.id,
        event_id: plan.event_id,
        name: plan.name,
        description: plan.description ?? null,
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