import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL } from '@/lib/support-contact'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

type OtpType = 'signup' | 'reset'

interface SendOtpBody {
  email: string
  type: OtpType
  fullName?: string
}

const OTP_EXPIRY_MINUTES = 10
const MAX_OTP_PER_WINDOW = 3
const MAX_RESET_OTP_PER_IP_WINDOW = 8

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function buildEmailHtml(type: OtpType, otp: string, greeting: string): string {
  const title    = type === 'signup' ? 'Verify your email'        : 'Reset your password'
  const bodyText = type === 'signup' ? 'Enter this code to complete your registration:' : 'Enter this code to reset your password:'
  const footer   = type === 'signup'
    ? 'This code expires in 10 minutes. Do not share it with anyone.'
    : "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email."

  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">' +
    '<div style="max-width:480px;margin:0 auto;background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:40px">' +
    '<p style="color:#d4af37;font-size:20px;font-weight:700;margin:0 0 2px;letter-spacing:-0.5px">BlakVote</p>' +
    '<p style="color:#666;font-size:13px;margin:0 0 28px">Premium Digital Voting Platform</p>' +
    '<h2 style="color:#f5f5f5;font-size:22px;font-weight:600;margin:0 0 20px">' + title + '</h2>' +
    '<p style="color:#a0a0a0;margin:0 0 6px;font-size:15px">' + greeting + '</p>' +
    '<p style="color:#a0a0a0;margin:0 0 24px;font-size:15px">' + bodyText + '</p>' +
    '<div style="background:#1a1a1a;border:1px solid #2e2c1a;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px">' +
    '<span style="font-size:44px;font-weight:700;letter-spacing:14px;color:#d4af37;display:block;line-height:1">' + otp + '</span>' +
    '</div>' +
    '<p style="color:#555;font-size:13px;margin:0;line-height:1.6">' + footer + '</p>' +
    '</div></body></html>'
  )
}

async function sendViaResend(
  email: string,
  otp: string,
  type: OtpType,
  fullName?: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')

  const from    = process.env.OTP_FROM_EMAIL ?? 'BlakVote <noreply@mail.blakvote.com>'
  const subject = type === 'signup' ? 'Your BlakVote verification code' : 'Your BlakVote password reset code'
  const greeting = fullName ? 'Hi ' + fullName.split(' ')[0] + ',' : 'Hello,'
  const html = buildEmailHtml(type, otp, greeting)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error('Resend API error ' + String(res.status) + ': ' + body)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!hasTrustedOrigin(req)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body: SendOtpBody = await req.json()
    const { email, type, fullName } = body

    if (!email || typeof email !== 'string') {
      return jsonNoStore({ error: 'A valid email address is required.' }, { status: 400 })
    }
    if (type !== 'signup' && type !== 'reset') {
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

    const normalizedEmail = email.trim().toLowerCase()
    const clientIp = extractClientIp(req)
    const ipRateLimit = checkRateLimit(`send-otp:${type}:ip:${clientIp}`, MAX_RESET_OTP_PER_IP_WINDOW, OTP_EXPIRY_MINUTES * 60 * 1000)

    if (!ipRateLimit.allowed) {
      return jsonNoStore(
        { error: 'Too many requests from this network. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(ipRateLimit.retryAfterMs) },
        }
      )
    }

    const admin = getAdminClient()
    const windowStart = new Date(Date.now() - OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { count, error: countError } = await admin
      .from('email_otps')
      .select('*', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .eq('type', type)
      .gte('created_at', windowStart)

    if (countError) throw new Error(countError.message)

    if ((count ?? 0) >= MAX_OTP_PER_WINDOW) {
      return jsonNoStore(
        { error: 'Too many codes requested. Please wait a few minutes and try again.' },
        { status: 429 }
      )
    }

    // Remove old unverified OTPs for this email+type
    await admin
      .from('email_otps')
      .delete()
      .eq('email', normalizedEmail)
      .eq('type', type)
      .eq('verified', false)

    const otp       = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { error: insertError } = await admin.from('email_otps').insert({
      email: normalizedEmail,
      otp,
      type,
      verified: false,
      expires_at: expiresAt,
    })

    if (insertError) throw new Error('Failed to save OTP: ' + insertError.message)

    await sendViaResend(normalizedEmail, otp, type, fullName)

    return jsonNoStore({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send verification code.'
    console.error('[send-otp]', message)
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
