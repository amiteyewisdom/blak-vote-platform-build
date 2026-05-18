import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireRole(supabase, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('email_otps')
      .select('id, email, purpose, attempts, verified, expires_at, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const suspicious = (data || []).filter((row) => Number(row.attempts || 0) >= 3 || row.verified === false)

    return NextResponse.json({ attempts: suspicious })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load OTP monitor' }, { status: 500 })
  }
}