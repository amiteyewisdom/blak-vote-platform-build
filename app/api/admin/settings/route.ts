import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { getSupabaseAdminClient } from '@/lib/server-security'

type AdminSettingsResponse = {
  platformName: string
  maxEventsPerOrganizer: number
  platformFeePercent: number
  ticketingCommissionPercent: number
  enableFraudDetection: boolean
  requireEmailVerification: boolean
  maintenanceMode: boolean
}

const DEFAULT_SETTINGS: AdminSettingsResponse = {
  platformName: 'BlakVote',
  maxEventsPerOrganizer: 10,
  platformFeePercent: 10,
  ticketingCommissionPercent: 10,
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
      .select('platform_name, max_events_per_organizer, platform_fee_percent, ticketing_commission_percent, enable_fraud_detection, require_email_verification, maintenance_mode')
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
      platformFeePercent:
        data.platform_fee_percent != null
          ? Number(data.platform_fee_percent)
          : DEFAULT_SETTINGS.platformFeePercent,
      ticketingCommissionPercent:
        data.ticketing_commission_percent != null
          ? Number(data.ticketing_commission_percent)
          : DEFAULT_SETTINGS.ticketingCommissionPercent,
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
    const platformFeePercent = Number(body?.platformFeePercent)
    const ticketingCommissionPercent = Number(body?.ticketingCommissionPercent)
    const enableFraudDetection = Boolean(body?.enableFraudDetection)
    const requireEmailVerification = Boolean(body?.requireEmailVerification)
    const maintenanceMode = Boolean(body?.maintenanceMode)

    if (!platformName) {
      return NextResponse.json({ error: 'Platform name is required' }, { status: 400 })
    }

    if (!Number.isInteger(maxEventsPerOrganizer) || maxEventsPerOrganizer <= 0) {
      return NextResponse.json({ error: 'Max events per organizer must be a positive integer' }, { status: 400 })
    }

    if (
      !Number.isFinite(platformFeePercent) ||
      platformFeePercent < 0 ||
      platformFeePercent > 100 ||
      !Number.isFinite(ticketingCommissionPercent) ||
      ticketingCommissionPercent < 0 ||
      ticketingCommissionPercent > 100
    ) {
      return NextResponse.json({ error: 'Fee percentages must be between 0 and 100' }, { status: 400 })
    }

    const payload = {
      platform_name: platformName,
      max_events_per_organizer: maxEventsPerOrganizer,
      platform_fee_percent: Number(platformFeePercent.toFixed(2)),
      ticketing_commission_percent: Number(ticketingCommissionPercent.toFixed(2)),
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
