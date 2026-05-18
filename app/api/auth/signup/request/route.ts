import { NextRequest, NextResponse } from 'next/server'
import { getPasswordPolicyError } from '@/lib/server-security'
import {
  generateOtpCode,
  getLatestOtp,
  getUserRecordByEmail,
  hashOtpCode,
  logAuthEvent,
  normalizeEmail,
  sendOtpEmail,
  splitFullName,
  storeOtpChallenge,
} from '@/lib/auth/server-auth'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

type SignupRequestBody = {
  fullName: string
  email: string
  password: string
}

const SIGNUP_WINDOW_MS = 10 * 60 * 1000
const MAX_SIGNUP_REQUESTS_PER_IP = 10
const MAX_SIGNUP_REQUESTS_PER_EMAIL = 5
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = (await request.json()) as Partial<SignupRequestBody>
    const fullName = typeof body.fullName === 'string' ? splitFullName(body.fullName).fullName : ''
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!fullName || !email || !password) {
      return jsonNoStore({ error: 'Full name, email, and password are required.' }, { status: 400 })
    }

    if (!EMAIL_REGEX.test(email)) {
      return jsonNoStore({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const passwordError = getPasswordPolicyError(password)
    if (passwordError) {
      return jsonNoStore({ error: passwordError }, { status: 400 })
    }

    const ipLimit = checkRateLimit(`auth:signup:ip:${ipAddress}`, MAX_SIGNUP_REQUESTS_PER_IP, SIGNUP_WINDOW_MS)
    const emailLimit = checkRateLimit(`auth:signup:email:${email}`, MAX_SIGNUP_REQUESTS_PER_EMAIL, SIGNUP_WINDOW_MS)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs)
      return jsonNoStore(
        { error: 'Too many signup attempts. Please wait before trying again.' },
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

    const existingOtp = await getLatestOtp(email, 'signup')
    if (existingOtp?.resend_available_at && new Date(existingOtp.resend_available_at).getTime() > Date.now()) {
      const retryAfterMs = new Date(existingOtp.resend_available_at).getTime() - Date.now()
      return jsonNoStore(
        { error: 'Please wait before requesting another code.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const otp = generateOtpCode()
    await storeOtpChallenge({
      email,
      purpose: 'signup',
      otp,
      fullName,
      password,
    })
    await sendOtpEmail({ email, otp, purpose: 'signup', fullName })

    await logAuthEvent({
      action: 'AUTH_SIGNUP_OTP_SENT',
      ipAddress,
      details: { email },
    })

    return jsonNoStore({
      success: true,
      email,
      expiresInSeconds: 300,
      resendInSeconds: 60,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start signup.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}