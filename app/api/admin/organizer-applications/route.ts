import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

const adminSupabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
)

export async function GET() {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) return auth.response

  const { data, error } = await adminSupabase
    .from('organizer_applications')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ applications: data || [] })
}

export async function POST(req: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) return auth.response

  const { applicationId, action } = await req.json()

  if (!applicationId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { data: app, error: appError } = await adminSupabase
    .from('organizer_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()

  if (appError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error: updateError } = await adminSupabase
    .from('organizer_applications')
    .update({ status: newStatus, reviewed_at: new Date().toISOString() })
    .eq('id', applicationId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (action === 'approve') {
    const userId = app.user_id || null

    if (userId) {
      await adminSupabase.from('users').update({ role: 'organizer' }).eq('id', userId)

      const organizerPayload = {
        user_id: userId,
        business_name: app.company || 'Organizer',
        business_description: app.bio || null,
        mobile_money_number: app.phone || null,
        status: 'approved',
      }

      const existingOrganizer = await adminSupabase
        .from('organizers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!existingOrganizer.data) {
        await adminSupabase.from('organizers').insert(organizerPayload)
      }
    }
  }

  return NextResponse.json({ success: true })
}
