import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface UpdatePasswordBody {
  email: string
  newPassword: string
}

interface UserIdRow {
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
    const body: UpdatePasswordBody = await req.json()
    const { email, newPassword } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = getAdminClient()
    const now   = new Date().toISOString()

    // Confirm a verified, unexpired reset OTP exists
    const { data: otpRecord, error: otpError } = await admin
      .from('email_otps')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('type', 'reset')
      .eq('verified', true)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (otpError) throw new Error(otpError.message)

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Password reset session expired. Please request a new code.' },
        { status: 400 }
      )
    }

    // Get user ID from public.users
    const { data: userData, error: userError } = await admin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle<UserIdRow>()

    if (userError) throw new Error(userError.message)
    if (!userData) {
      return NextResponse.json({ error: 'No account found with this email.' }, { status: 404 })
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userData.id, {
      password: newPassword,
    })
    if (updateError) throw new Error(updateError.message)

    // Clean up all reset OTPs for this email
    await admin.from('email_otps').delete().eq('email', normalizedEmail).eq('type', 'reset')

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update password.'
    console.error('[update-password]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
