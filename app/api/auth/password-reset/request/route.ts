import { NextRequest, NextResponse } from 'next/server'
import {
  generateOtpCode,
  getLatestOtp,
  getUserRecordByEmail,
  logAuthEvent,
  normalizeEmail,
  sendOtpEmail,
  storeOtpChallenge,
} from '@/lib/auth/server-auth'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

type PasswordResetRequestBody = {
  email: string
}

const RESET_WINDOW_MS = 10 * 60 * 1000
const MAX_RESET_REQUESTS_PER_IP = 10
const MAX_RESET_REQUESTS_PER_EMAIL = 5

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = (await request.json()) as Partial<PasswordResetRequestBody>
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    if (!email) {
      return jsonNoStore({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(`auth:reset:ip:${ipAddress}`, MAX_RESET_REQUESTS_PER_IP, RESET_WINDOW_MS)
    const emailLimit = checkRateLimit(`auth:reset:email:${email}`, MAX_RESET_REQUESTS_PER_EMAIL, RESET_WINDOW_MS)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs)
      return jsonNoStore(
        { error: 'Too many reset requests. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const latestOtp = await getLatestOtp(email, 'reset_password')
    if (latestOtp?.resend_available_at && new Date(latestOtp.resend_available_at).getTime() > Date.now()) {
      const retryAfterMs = new Date(latestOtp.resend_available_at).getTime() - Date.now()
      return jsonNoStore(
        { error: 'Please wait before requesting another code.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const userRecord = await getUserRecordByEmail(email)
    if (userRecord?.status === 'active' || !userRecord?.status) {
      const otp = generateOtpCode()
      await storeOtpChallenge({
        email,
        purpose: 'reset_password',
        otp,
      })
      await sendOtpEmail({
        email,
        otp,
        purpose: 'reset_password',
        fullName: userRecord?.full_name || [userRecord?.first_name, userRecord?.last_name].filter(Boolean).join(' ') || undefined,
      })
    }

    await logAuthEvent({
      action: 'AUTH_PASSWORD_RESET_OTP_SENT',
      ipAddress,
      details: { email, userExists: Boolean(userRecord) },
    })

    return jsonNoStore({
      success: true,
      email,
      message: 'If an account exists for this email, a reset code has been sent.',
      resendInSeconds: 60,
      expiresInSeconds: 300,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request password reset.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}