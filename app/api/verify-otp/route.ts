import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type OtpType = 'signup' | 'reset'

interface VerifyOtpBody {
  email: string
  otp: string
  type: OtpType
  password?: string
  fullName?: string
}

interface OtpRecord {
  id: string
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: VerifyOtpBody = await req.json()
    const { email, otp, type, password, fullName } = body

    if (!email || !otp || !type) {
      return NextResponse.json({ error: 'email, otp, and type are required.' }, { status: 400 })
    }
    if (type !== 'signup' && type !== 'reset') {
      return NextResponse.json({ error: 'Invalid OTP type.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = getAdminClient()
    const now = new Date().toISOString()

    const { data: record, error: lookupError } = await admin
      .from('email_otps')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('otp', otp.trim())
      .eq('type', type)
      .eq('verified', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<OtpRecord>()

    if (lookupError) throw new Error(lookupError.message)

    if (!record) {
      return NextResponse.json(
        { error: 'Invalid or expired code. Please check the code and try again.' },
        { status: 400 }
      )
    }

    // ── SIGNUP: create Supabase auth account ──────────────────────────────────
    if (type === 'signup') {
      if (!password || !fullName) {
        return NextResponse.json(
          { error: 'password and fullName are required for signup.' },
          { status: 400 }
        )
      }

      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

      if (createError) {
        const msg = createError.message.toLowerCase()
        if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists')) {
          return NextResponse.json(
            { error: 'An account with this email already exists. Please sign in.' },
            { status: 409 }
          )
        }
        throw createError
      }

      const userId   = createData.user.id
      const parts    = fullName.trim().split(/\s+/)
      const firstName = parts[0] ?? ''
      const lastName  = parts.slice(1).join(' ')

      await admin.from('users').upsert(
        { id: userId, email: normalizedEmail, first_name: firstName, last_name: lastName, role: 'voter', status: 'active' },
        { onConflict: 'id' }
      )

      await admin.from('email_otps').delete().eq('id', record.id)

      return NextResponse.json({ success: true, action: 'signup' })
    }

    // ── RESET: mark OTP as verified; update-password route consumes it ────────
    const { error: markError } = await admin
      .from('email_otps')
      .update({ verified: true })
      .eq('id', record.id)

    if (markError) throw new Error(markError.message)

    return NextResponse.json({ success: true, action: 'reset' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed.'
    console.error('[verify-otp]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
