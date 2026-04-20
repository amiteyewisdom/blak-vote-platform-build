import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

type OrganizerSettingsResponse = {
  organization_name: string
  contact_email: string
  enable_notifications: boolean
  enable_public_results: boolean
}

const DEFAULT_SETTINGS: OrganizerSettingsResponse = {
  organization_name: '',
  contact_email: '',
  enable_notifications: true,
  enable_public_results: false,
}

export async function GET() {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const [{ data: profile }, { data: organizerProfile }, settingsResult, authUserResult] = await Promise.all([
      supabase
        .from('users')
        .select('email')
        .eq('id', auth.userId)
        .maybeSingle(),
      supabase
        .from('organizers')
        .select('business_name')
        .eq('user_id', auth.userId)
        .maybeSingle(),
      supabase
        .from('organizer_settings')
        .select('organization_name, contact_email, enable_notifications, enable_public_results')
        .eq('organizer_user_id', auth.userId)
        .maybeSingle(),
      supabase.auth.getUser(),
    ])

    const settings = settingsResult.data
    const metadataSettings = authUserResult.data?.user?.user_metadata?.organizer_settings as
      | Partial<OrganizerSettingsResponse>
      | undefined

    return NextResponse.json({
      organization_name:
        settings?.organization_name ??
        metadataSettings?.organization_name ??
        organizerProfile?.business_name ??
        DEFAULT_SETTINGS.organization_name,
      contact_email:
        settings?.contact_email ??
        metadataSettings?.contact_email ??
        profile?.email ??
        DEFAULT_SETTINGS.contact_email,
      enable_notifications:
        settings?.enable_notifications ??
        metadataSettings?.enable_notifications ??
        DEFAULT_SETTINGS.enable_notifications,
      enable_public_results:
        settings?.enable_public_results ??
        metadataSettings?.enable_public_results ??
        DEFAULT_SETTINGS.enable_public_results,
    })
  } catch (error) {
    console.error('Organizer settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load organizer settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const auth = await requireRole(supabase, ['organizer'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => null)

    const organizationName = String(body?.organization_name ?? '').trim()
    const contactEmail = String(body?.contact_email ?? '').trim().toLowerCase()
    const enableNotifications = Boolean(body?.enable_notifications)
    const enablePublicResults = Boolean(body?.enable_public_results)

    if (!organizationName) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contactEmail)) {
      return NextResponse.json({ error: 'Enter a valid contact email' }, { status: 400 })
    }

    const payload = {
      organizer_user_id: auth.userId,
      organization_name: organizationName,
      contact_email: contactEmail,
      enable_notifications: enableNotifications,
      enable_public_results: enablePublicResults,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('organizer_settings')
      .upsert(payload, { onConflict: 'organizer_user_id' })

    const tableSaveError = upsertError ? upsertError.message : null
    const tableSaveSucceeded = !upsertError

    // Keep organizer directory/profile name aligned with settings when possible.
    await supabase
      .from('organizers')
      .update({ business_name: organizationName })
      .eq('user_id', auth.userId)

    const authUser = await supabase.auth.getUser()
    const existingMetadata = authUser.data.user?.user_metadata || {}
    const organizerMetadata = {
      ...((existingMetadata as Record<string, any>).organizer_settings || {}),
      organization_name: organizationName,
      contact_email: contactEmail,
      enable_notifications: enableNotifications,
      enable_public_results: enablePublicResults,
      updated_at: new Date().toISOString(),
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        ...existingMetadata,
        organizer_settings: organizerMetadata,
      },
    })

    const metadataSaveSucceeded = !authUpdateError

    if (!tableSaveSucceeded && !metadataSaveSucceeded) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      storage: tableSaveSucceeded && metadataSaveSucceeded
        ? 'table+metadata'
        : tableSaveSucceeded
        ? 'table'
        : 'metadata',
      warning: tableSaveError || authUpdateError?.message || undefined,
    })
  } catch (error) {
    console.error('Organizer settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save organizer settings' }, { status: 500 })
  }
}
