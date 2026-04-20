import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/server-security'

const purchaseSchema = z.object({
  ticketId: z.string().uuid(),
  buyerName: z.string().trim().min(2).max(120),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().trim().max(30).optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  paymentReference: z.string().trim().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = purchaseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { ticketId, buyerName, buyerEmail, buyerPhone, quantity, paymentReference } = parsed.data
    const supabase = getSupabaseAdminClient()

    const { data: plan, error: planError } = await supabase
      .from('tickets')
      .select('id, event_id, name, price, quantity, sold_count, ticket_kind')
      .eq('id', ticketId)
      .maybeSingle()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Ticket plan not found' }, { status: 404 })
    }

    if (plan.ticket_kind !== 'plan') {
      return NextResponse.json({ error: 'Only ticket plans can be purchased' }, { status: 409 })
    }

    const totalQuantity = Math.max(1, Number(plan.quantity || 1))
    const soldCount = Math.max(0, Number(plan.sold_count || 0))
    const remainingQuantity = Math.max(totalQuantity - soldCount, 0)

    if (remainingQuantity < quantity) {
      return NextResponse.json({ error: `Only ${remainingQuantity} tickets remaining for this plan` }, { status: 409 })
    }

    if (Number(plan.price || 0) > 0) {
      if (!paymentReference) {
        return NextResponse.json(
          { error: 'Paid tickets must be issued through verified payment processing.' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: 'Paid ticket issuance is handled during payment verification.' },
        { status: 202 }
      )
    }

    const { data: issuedTickets, error: issueError } = await supabase.rpc('issue_ticket_purchase', {
      p_plan_id: ticketId,
      p_payment_reference: null,
      p_buyer_name: buyerName,
      p_buyer_email: buyerEmail,
      p_buyer_phone: buyerPhone || null,
      p_quantity: quantity,
    })

    if (issueError) {
      return NextResponse.json({ error: issueError.message }, { status: 409 })
    }

    const ticketCodes = (issuedTickets || []).map((ticket: { ticket_code: string }) => ticket.ticket_code)

    return NextResponse.json({
      success: true,
      message: `${ticketCodes.length} ticket${ticketCodes.length === 1 ? '' : 's'} issued successfully`,
      ticketCodes,
      issuedCount: ticketCodes.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}