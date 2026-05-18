import { NextRequest, NextResponse } from 'next/server'
import { getRedirectPathForRole } from '@/lib/auth/role-routing'
import {
  buildClientSession,
  createUserFromSignupOtp,
  getLatestOtp,
  getUserRecordByEmail,
  hashOtpCode,
  incrementOtpAttempts,
  logAuthEvent,
  markOtpVerified,
  normalizeEmail,
  startUserSession,
} from '@/lib/auth/server-auth'
import { applyNoStoreHeaders, checkRateLimit, extractClientIp, getRetryAfterSeconds, hasTrustedOrigin } from '@/lib/server-security'

type SignupVerifyBody = {
  email: string
  otp: string
}

const VERIFY_WINDOW_MS = 10 * 60 * 1000
const MAX_VERIFY_ATTEMPTS_PER_IP = 20
const MAX_VERIFY_ATTEMPTS_PER_EMAIL = 10

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = (await request.json()) as Partial<SignupVerifyBody>
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const otp = typeof body.otp === 'string' ? body.otp.trim() : ''

    if (!email || !/^\d{6}$/.test(otp)) {
      return jsonNoStore({ error: 'Email and a valid 6-digit OTP are required.' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(`auth:signup:verify:ip:${ipAddress}`, MAX_VERIFY_ATTEMPTS_PER_IP, VERIFY_WINDOW_MS)
    const emailLimit = checkRateLimit(`auth:signup:verify:email:${email}`, MAX_VERIFY_ATTEMPTS_PER_EMAIL, VERIFY_WINDOW_MS)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs)
      return jsonNoStore(
        { error: 'Too many verification attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const existingUser = await getUserRecordByEmail(email)
    if (existingUser) {
      return jsonNoStore({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 })
    }

    const otpRow = await getLatestOtp(email, 'signup')
    if (!otpRow || otpRow.verified) {
      return jsonNoStore({ error: 'Invalid or expired OTP. Request a new code.' }, { status: 400 })
    }

    if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
      return jsonNoStore({ error: 'This OTP has expired. Request a new code.' }, { status: 400 })
    }

    const attempts = otpRow.attempts ?? 0
    if (attempts >= 5) {
      return jsonNoStore({ error: 'Maximum OTP attempts reached. Request a new code.' }, { status: 429 })
    }

    if (otpRow.otp_hash !== hashOtpCode(email, 'signup', otp)) {
      await incrementOtpAttempts(otpRow.id, attempts)
      await logAuthEvent({
        action: 'AUTH_SIGNUP_OTP_FAILED',
        severity: 'warning',
        ipAddress,
        details: { email, reason: 'hash_mismatch', attempts: attempts + 1 },
      })
      return jsonNoStore({ error: 'Invalid OTP. Please try again.' }, { status: 400 })
    }

    const user = await createUserFromSignupOtp(email, otpRow)
    await markOtpVerified(otpRow.id)

    const response = jsonNoStore({
      success: true,
      ...buildClientSession(user),
      redirectTo: getRedirectPathForRole(user.role),
    })

    await startUserSession(response, user, {
      ipAddress,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    await logAuthEvent({
      action: 'AUTH_SIGNUP_COMPLETED',
      userId: user.id,
      ipAddress,
      details: { email },
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify signup OTP.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}