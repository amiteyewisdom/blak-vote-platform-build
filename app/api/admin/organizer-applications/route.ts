import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

function getAdminSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

export async function GET() {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) return auth.response

  const adminSupabase = getAdminSupabase()
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Supabase admin credentials are not configured' }, { status: 500 })
  }

  const { data, error } = await adminSupabase
    .from('organizer_applications')
    .select('id, user_id, organization_name, organization_id, address, phone_number, description, document_url, status, created_at, submitted_at, reviewed_at, company, bio, phone, email, id_number')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const applications = await Promise.all(
    (data || []).map(async (application) => {
      let documentSignedUrl: string | null = null

      if (application.document_url) {
        const signed = await adminSupabase.storage
          .from('organizer-documents')
          .createSignedUrl(application.document_url, 10 * 60)

        documentSignedUrl = signed.data?.signedUrl || null
      }

      return {
        ...application,
        document_signed_url: documentSignedUrl,
      }
    })
  )

  return NextResponse.json({ applications })
}

export async function POST(req: Request) {
  const sessionClient = await createServerClient()
  const auth = await requireRole(sessionClient, ['admin'])
  if (!auth.ok) return auth.response

  const adminSupabase = getAdminSupabase()
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Supabase admin credentials are not configured' }, { status: 500 })
  }

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
      await adminSupabase.from('users').update({ role: 'organizer', updated_at: new Date().toISOString() }).eq('id', userId)

      const organizerPayload = {
        user_id: userId,
        business_name: app.organization_name || app.company || 'Organizer',
        business_description: app.description || app.bio || null,
        mobile_money_number: app.phone_number || app.phone || null,
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
