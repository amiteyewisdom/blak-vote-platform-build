import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureEventOwnedByOrganizer, requireRole } from '@/lib/api-auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { eventId, amount, method, accountDetails } = body

    if (!eventId || !amount || amount <= 0 || !method || !accountDetails) {
      return NextResponse.json({ error: 'Invalid withdrawal request payload' }, { status: 400 })
    }

    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const ownershipError = await ensureEventOwnedByOrganizer(supabase, eventId, auth.userId)
    if (ownershipError) {
      return ownershipError
    }

    const { error } = await supabase.rpc('request_organizer_withdrawal', {
      p_organizer_id: auth.userId,
      p_amount: amount,
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
