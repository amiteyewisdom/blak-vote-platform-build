import { NextRequest, NextResponse } from 'next/server'
import {
  getLatestOtp,
  hashOtpCode,
  incrementOtpAttempts,
  logAuthEvent,
  markOtpVerified,
  normalizeEmail,
  setResetCookie,
} from '@/lib/auth/server-auth'
import { applyNoStoreHeaders, checkRateLimit, extractClientIp, getRetryAfterSeconds, hasTrustedOrigin } from '@/lib/server-security'

type PasswordResetVerifyBody = {
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

    const body = (await request.json()) as Partial<PasswordResetVerifyBody>
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const otp = typeof body.otp === 'string' ? body.otp.trim() : ''
    if (!email || !/^\d{6}$/.test(otp)) {
      return jsonNoStore({ error: 'Email and a valid 6-digit OTP are required.' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(`auth:reset:verify:ip:${ipAddress}`, MAX_VERIFY_ATTEMPTS_PER_IP, VERIFY_WINDOW_MS)
    const emailLimit = checkRateLimit(`auth:reset:verify:email:${email}`, MAX_VERIFY_ATTEMPTS_PER_EMAIL, VERIFY_WINDOW_MS)
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

    const otpRow = await getLatestOtp(email, 'reset_password')
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

    if (otpRow.otp_hash !== hashOtpCode(email, 'reset_password', otp)) {
      await incrementOtpAttempts(otpRow.id, attempts)
      await logAuthEvent({
        action: 'AUTH_PASSWORD_RESET_OTP_FAILED',
        severity: 'warning',
        ipAddress,
        details: { email, attempts: attempts + 1 },
      })
      return jsonNoStore({ error: 'Invalid OTP. Please try again.' }, { status: 400 })
    }

    await markOtpVerified(otpRow.id)
    const response = jsonNoStore({ success: true, email })
    await setResetCookie(response, email, otpRow.id)

    await logAuthEvent({
      action: 'AUTH_PASSWORD_RESET_OTP_VERIFIED',
      ipAddress,
      details: { email },
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify reset OTP.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}