import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { eventId, amount, method, accountDetails } = body

    const supabase = createServerClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.rpc('request_withdrawal', {
      p_event_id: eventId,
      p_organizer_id: user.id,
      p_gross_amount: amount,
      p_method: method,
      p_account_details: accountDetails
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
