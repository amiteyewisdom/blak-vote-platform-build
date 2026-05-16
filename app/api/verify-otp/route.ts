import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, logRateLimitViolation } from '@/lib/audit-logging'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL } from '@/lib/support-contact'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

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

const VERIFY_OTP_WINDOW_MS = 10 * 60 * 1000
const MAX_VERIFY_OTP_PER_IP_WINDOW = 20
const MAX_VERIFY_OTP_PER_EMAIL_WINDOW = 10

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!hasTrustedOrigin(req)) {
      await logAudit({
        action: 'OTP_VERIFICATION_FAILED',
        severity: 'warning',
        ip_address: extractClientIp(req),
        details: { reason: 'Cross-site request blocked.' },
      })

      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body: VerifyOtpBody = await req.json()
    const { email, otp, type, password, fullName } = body
    const clientIp = extractClientIp(req)
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (!email || !otp || !type) {
      await logAudit({
        action: 'OTP_VERIFICATION_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Missing email, otp, or type.', email: normalizedEmail || undefined },
      })

      return jsonNoStore({ error: 'email, otp, and type are required.' }, { status: 400 })
    }
    if (type !== 'signup' && type !== 'reset') {
      await logAudit({
        action: 'OTP_VERIFICATION_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Invalid OTP type.', email: normalizedEmail || undefined, type },
      })

      return jsonNoStore({ error: 'Invalid OTP type.' }, { status: 400 })
    }

    if (type === 'signup') {
      return jsonNoStore(
        {
          error: `Self-service account creation is disabled. Contact ${SUPPORT_EMAIL} or ${SUPPORT_WHATSAPP_LABEL} for account setup.`,
        },
        { status: 403 }
      )
    }

    const ipRateLimit = checkRateLimit(`verify-otp:${type}:ip:${clientIp}`, MAX_VERIFY_OTP_PER_IP_WINDOW, VERIFY_OTP_WINDOW_MS)
    const emailRateLimit = checkRateLimit(`verify-otp:${type}:email:${normalizedEmail}`, MAX_VERIFY_OTP_PER_EMAIL_WINDOW, VERIFY_OTP_WINDOW_MS)

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      const retryAfterMs = Math.max(ipRateLimit.retryAfterMs, emailRateLimit.retryAfterMs)
      await logRateLimitViolation('app/api/verify-otp', clientIp, MAX_VERIFY_OTP_PER_IP_WINDOW)
      await logAudit({
        action: 'OTP_VERIFICATION_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Rate limit exceeded.', email: normalizedEmail, type },
      })

      return jsonNoStore(
        { error: 'Too many verification attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

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
      await logAudit({
        action: 'OTP_VERIFICATION_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Invalid or expired code.', email: normalizedEmail, type },
      })

      return jsonNoStore(
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

      return jsonNoStore({ success: true, action: 'signup' })
    }

    // ── RESET: mark OTP as verified; update-password route consumes it ────────
    const { error: markError } = await admin
      .from('email_otps')
      .update({ verified: true })
      .eq('id', record.id)

    if (markError) throw new Error(markError.message)

    return jsonNoStore({ success: true, action: 'reset' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed.'
    console.error('[verify-otp]', message)
    await logAudit({
      action: 'OTP_VERIFICATION_FAILED',
      severity: 'warning',
      ip_address: extractClientIp(req),
      details: { reason: message },
    })
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
