import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

type AdminSettingsResponse = {
  platformName: string
  maxEventsPerOrganizer: number
  enableFraudDetection: boolean
  requireEmailVerification: boolean
  maintenanceMode: boolean
}

const DEFAULT_SETTINGS: AdminSettingsResponse = {
  platformName: 'BlakVote',
  maxEventsPerOrganizer: 10,
  enableFraudDetection: true,
  requireEmailVerification: true,
  maintenanceMode: false,
}

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const { data, error } = await adminSupabase
      .from('platform_settings')
      .select('platform_name, max_events_per_organizer, enable_fraud_detection, require_email_verification, maintenance_mode')
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    return NextResponse.json({
      platformName: data.platform_name ?? DEFAULT_SETTINGS.platformName,
      maxEventsPerOrganizer:
        data.max_events_per_organizer != null
          ? Number(data.max_events_per_organizer)
          : DEFAULT_SETTINGS.maxEventsPerOrganizer,
      enableFraudDetection: data.enable_fraud_detection ?? DEFAULT_SETTINGS.enableFraudDetection,
      requireEmailVerification:
        data.require_email_verification ?? DEFAULT_SETTINGS.requireEmailVerification,
      maintenanceMode: data.maintenance_mode ?? DEFAULT_SETTINGS.maintenanceMode,
    })
  } catch (error) {
    console.error('Admin settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load admin settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = getSupabaseAdminClient()

    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json().catch(() => null)

    const platformName = String(body?.platformName ?? '').trim()
    const maxEventsPerOrganizer = Number.parseInt(String(body?.maxEventsPerOrganizer ?? ''), 10)
    const enableFraudDetection = Boolean(body?.enableFraudDetection)
    const requireEmailVerification = Boolean(body?.requireEmailVerification)
    const maintenanceMode = Boolean(body?.maintenanceMode)

    if (!platformName) {
      return NextResponse.json({ error: 'Platform name is required' }, { status: 400 })
    }

    if (!Number.isInteger(maxEventsPerOrganizer) || maxEventsPerOrganizer <= 0) {
      return NextResponse.json({ error: 'Max events per organizer must be a positive integer' }, { status: 400 })
    }

    const payload = {
      platform_name: platformName,
      max_events_per_organizer: maxEventsPerOrganizer,
      enable_fraud_detection: enableFraudDetection,
      require_email_verification: requireEmailVerification,
      maintenance_mode: maintenanceMode,
      updated_at: new Date().toISOString(),
    }

    const { data: existing, error: existingError } = await adminSupabase
      .from('platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const result = existing
      ? await adminSupabase.from('platform_settings').update(payload).eq('id', existing.id)
      : await adminSupabase.from('platform_settings').insert(payload)

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save admin settings' }, { status: 500 })
  }
}
