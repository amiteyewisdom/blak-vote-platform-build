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
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      const msg = String(error.message || '').toLowerCase()
      // If the table itself is missing or a column doesn't exist, return defaults rather than 500
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('column') ||
        msg.includes('undefined')
      ) {
        console.warn('[admin/settings] platform_settings schema issue, returning defaults:', error.message)
        return NextResponse.json(DEFAULT_SETTINGS)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    return NextResponse.json({
      platformName: (data as any).platform_name ?? DEFAULT_SETTINGS.platformName,
      maxEventsPerOrganizer:
        (data as any).max_events_per_organizer != null
          ? Number((data as any).max_events_per_organizer)
          : DEFAULT_SETTINGS.maxEventsPerOrganizer,
      platformFeePercent:
        (data as any).platform_fee_percent != null
          ? Number((data as any).platform_fee_percent)
          : DEFAULT_SETTINGS.platformFeePercent,
      ticketingCommissionPercent:
        (data as any).ticketing_commission_percent != null
          ? Number((data as any).ticketing_commission_percent)
          : DEFAULT_SETTINGS.ticketingCommissionPercent,
      enableFraudDetection: (data as any).enable_fraud_detection ?? DEFAULT_SETTINGS.enableFraudDetection,
      requireEmailVerification:
        (data as any).require_email_verification ?? DEFAULT_SETTINGS.requireEmailVerification,
      maintenanceMode: (data as any).maintenance_mode ?? DEFAULT_SETTINGS.maintenanceMode,
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

    let result = existing
      ? await adminSupabase.from('platform_settings').update(payload).eq('id', existing.id)
      : await adminSupabase.from('platform_settings').insert(payload)

    // If column doesn't exist yet in DB schema, retry without ticketing_commission_percent
    if (result.error) {
      const errMsg = String(result.error.message || '').toLowerCase()
      if (errMsg.includes('ticketing_commission_percent') || errMsg.includes('column') || errMsg.includes('does not exist')) {
        const { ticketing_commission_percent: _dropped, ...fallbackPayload } = payload
        result = existing
          ? await adminSupabase.from('platform_settings').update(fallbackPayload).eq('id', existing.id)
          : await adminSupabase.from('platform_settings').insert(fallbackPayload)
      }
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save admin settings' }, { status: 500 })
  }
}
