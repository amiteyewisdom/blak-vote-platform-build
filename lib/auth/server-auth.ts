import 'server-only'

import bcrypt from 'bcrypt'
import { createClient } from '@supabase/supabase-js'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
} from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit-logging'
import { getSupabaseAdminClient } from '@/lib/server-security'
import {
  ACCESS_COOKIE_NAME,
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenPayload,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  RESET_COOKIE_NAME,
  RESET_TOKEN_TTL_SECONDS,
  type ResetTokenPayload,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth/session-token'

export type AppRole = 'admin' | 'organizer' | 'voter'

export type AuthenticatedUser = {
  id: string
  email: string
  role: AppRole
  fullName: string
  firstName: string | null
  lastName: string | null
  status: string
  emailVerified: boolean
}

type UserRow = {
  id: string
  email: string
  role: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  email_verified: boolean | null
  password_hash?: string | null
}

type SessionRow = {
  id: string
  user_id: string
  refresh_token: string
  expires_at: string
}

type EmailOtpRow = {
  id: string
  email: string
  otp_hash: string | null
  purpose: string | null
  expires_at: string
  attempts: number | null
  verified: boolean | null
  resend_available_at: string | null
  payload: Record<string, unknown> | null
}

type SessionResolution = {
  user: AuthenticatedUser | null
  sessionId: string | null
  source: 'access' | 'refresh' | null
}

function getEncryptionSecret() {
  return process.env.AUTH_DATA_ENCRYPTION_KEY || process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET
}

function getOtpSecret() {
  const secret = process.env.AUTH_OTP_SECRET || process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET

  if (!secret) {
    throw new Error('Missing AUTH_OTP_SECRET or AUTH_JWT_SECRET environment variable.')
  }

  return secret
}

function buildCookieOptions(maxAge: number, httpOnly = true) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

function hashSha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeRole(value: string | null | undefined): AppRole {
  if (value === 'admin' || value === 'organizer' || value === 'voter') {
    return value
  }

  return 'voter'
}

function sanitizeText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function normalizeEmail(value: string) {
  return sanitizeText(value, 320).toLowerCase()
}

export function splitFullName(fullName: string) {
  const sanitized = sanitizeText(fullName, 160)
  const parts = sanitized.split(' ').filter(Boolean)

  return {
    fullName: sanitized,
    firstName: parts[0] ?? sanitized,
    lastName: parts.slice(1).join(' ') || null,
  }
}

function encryptSecret(plainText: string) {
  const secret = getEncryptionSecret()
  if (!secret) {
    throw new Error('Missing AUTH_DATA_ENCRYPTION_KEY or AUTH_JWT_SECRET environment variable.')
  }

  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptSecret(value: string) {
  const secret = getEncryptionSecret()
  if (!secret) {
    throw new Error('Missing AUTH_DATA_ENCRYPTION_KEY or AUTH_JWT_SECRET environment variable.')
  }

  const [ivHex, tagHex, encryptedHex] = value.split(':')
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid encrypted payload format.')
  }

  const key = createHash('sha256').update(secret).digest()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

function mapUser(row: UserRow | null): AuthenticatedUser | null {
  if (!row?.id || !row.email) {
    return null
  }

  const fullName =
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    row.email

  return {
    id: row.id,
    email: row.email,
    role: normalizeRole(row.role),
    fullName,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    status: row.status || 'active',
    emailVerified: row.email_verified === true,
  }
}

async function getUserById(userId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, full_name, first_name, last_name, status, email_verified')
    .eq('id', userId)
    .maybeSingle<UserRow>()

  if (error) {
    throw new Error(error.message)
  }

  return mapUser(data)
}

export async function getUserRecordByEmail(email: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, full_name, first_name, last_name, status, email_verified, password_hash')
    .eq('email', normalizeEmail(email))
    .maybeSingle<UserRow>()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

function hashRefreshToken(token: string) {
  return hashSha256(token)
}

export function hashOtpCode(email: string, purpose: 'signup' | 'reset_password', otp: string) {
  return hashSha256(`${normalizeEmail(email)}:${purpose}:${otp}:${getOtpSecret()}`)
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

function getSupabasePublishableClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    return null
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export async function clearAuthCookies(response: NextResponse) {
  response.cookies.set({ name: ACCESS_COOKIE_NAME, value: '', ...buildCookieOptions(0) })
  response.cookies.set({ name: REFRESH_COOKIE_NAME, value: '', ...buildCookieOptions(0) })
  response.cookies.set({ name: RESET_COOKIE_NAME, value: '', ...buildCookieOptions(0) })
}

async function createAccessToken(user: AuthenticatedUser, sessionId: string) {
  return signSessionToken<Omit<AccessTokenPayload, 'iat' | 'exp'>>(
    {
      type: 'access',
      sub: user.id,
      sid: sessionId,
      email: user.email,
      role: user.role,
      full_name: user.fullName,
      first_name: user.firstName || undefined,
      last_name: user.lastName || undefined,
    },
    ACCESS_TOKEN_TTL_SECONDS
  )
}

export async function startUserSession(
  response: NextResponse,
  user: AuthenticatedUser,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const supabase = getSupabaseAdminClient()
  const sessionId = randomUUID()
  const refreshToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()

  const { error } = await supabase.from('sessions').insert({
    id: sessionId,
    user_id: user.id,
    refresh_token: hashRefreshToken(refreshToken),
    expires_at: expiresAt,
    ip_address: metadata?.ipAddress ?? null,
    user_agent: metadata?.userAgent ?? null,
    last_used_at: new Date().toISOString(),
  })

  if (error) {
    throw new Error(error.message)
  }

  const accessToken = await createAccessToken(user, sessionId)
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: accessToken,
    ...buildCookieOptions(ACCESS_TOKEN_TTL_SECONDS),
  })
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    ...buildCookieOptions(REFRESH_TOKEN_TTL_SECONDS),
  })
}

export async function rotateUserSession(
  response: NextResponse,
  user: AuthenticatedUser,
  sessionId: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const supabase = getSupabaseAdminClient()
  const refreshToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()

  const { error } = await supabase
    .from('sessions')
    .update({
      refresh_token: hashRefreshToken(refreshToken),
      expires_at: expiresAt,
      ip_address: metadata?.ipAddress ?? null,
      user_agent: metadata?.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(error.message)
  }

  const accessToken = await createAccessToken(user, sessionId)
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: accessToken,
    ...buildCookieOptions(ACCESS_TOKEN_TTL_SECONDS),
  })
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    ...buildCookieOptions(REFRESH_TOKEN_TTL_SECONDS),
  })
}

async function resolveSessionFromCookies(): Promise<SessionResolution> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value
  const supabase = getSupabaseAdminClient()
  const now = new Date().toISOString()

  if (accessToken) {
    const payload = await verifySessionToken<AccessTokenPayload>(accessToken)

    if (payload?.type === 'access') {
      const { data: sessionRow, error: sessionError } = await supabase
        .from('sessions')
        .select('id, user_id, refresh_token, expires_at')
        .eq('id', payload.sid)
        .gt('expires_at', now)
        .maybeSingle<SessionRow>()

      if (!sessionError && sessionRow?.user_id === payload.sub) {
        const user = await getUserById(payload.sub)

        if (user && user.status !== 'deleted') {
          return {
            user,
            sessionId: sessionRow.id,
            source: 'access',
          }
        }
      }
    }
  }

  if (!refreshToken) {
    return { user: null, sessionId: null, source: null }
  }

  const { data: refreshSession, error: refreshError } = await supabase
    .from('sessions')
    .select('id, user_id, refresh_token, expires_at')
    .eq('refresh_token', hashRefreshToken(refreshToken))
    .gt('expires_at', now)
    .maybeSingle<SessionRow>()

  if (refreshError || !refreshSession) {
    return { user: null, sessionId: null, source: null }
  }

  const user = await getUserById(refreshSession.user_id)
  if (!user || user.status === 'deleted') {
    return { user: null, sessionId: null, source: null }
  }

  return {
    user,
    sessionId: refreshSession.id,
    source: 'refresh',
  }
}

export async function getAuthenticatedUser() {
  const session = await resolveSessionFromCookies()
  return session.user
}

export async function getAuthenticatedSession() {
  return resolveSessionFromCookies()
}

export async function invalidateCurrentSession() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value
  const supabase = getSupabaseAdminClient()

  if (refreshToken) {
    await supabase.from('sessions').delete().eq('refresh_token', hashRefreshToken(refreshToken))
    return
  }

  if (accessToken) {
    const payload = await verifySessionToken<AccessTokenPayload>(accessToken)
    if (payload?.sid) {
      await supabase.from('sessions').delete().eq('id', payload.sid)
    }
  }
}

export async function invalidateAllUserSessions(userId: string) {
  const supabase = getSupabaseAdminClient()
  await supabase.from('sessions').delete().eq('user_id', userId)
}

export function buildClientSession(user: AuthenticatedUser | null) {
  if (!user) {
    return {
      authenticated: false,
      user: null,
    }
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      emailVerified: user.emailVerified,
    },
  }
}

export async function storeOtpChallenge(input: {
  email: string
  purpose: 'signup' | 'reset_password'
  otp: string
  fullName?: string
  password?: string
}) {
  const supabase = getSupabaseAdminClient()
  const normalizedEmail = normalizeEmail(input.email)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const resendAvailableAt = new Date(Date.now() + 60 * 1000).toISOString()
  const payload =
    input.purpose === 'signup' && input.fullName && input.password
      ? {
          full_name: splitFullName(input.fullName).fullName,
          password_cipher: encryptSecret(input.password),
        }
      : null

  await supabase
    .from('email_otps')
    .delete()
    .eq('email', normalizedEmail)
    .eq('purpose', input.purpose)
    .eq('verified', false)

  const { error } = await supabase.from('email_otps').insert({
    email: normalizedEmail,
    otp: hashOtpCode(normalizedEmail, input.purpose, input.otp),
    otp_hash: hashOtpCode(normalizedEmail, input.purpose, input.otp),
    type: input.purpose === 'signup' ? 'signup' : 'reset',
    purpose: input.purpose,
    expires_at: expiresAt,
    attempts: 0,
    verified: false,
    resend_available_at: resendAvailableAt,
    payload,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    expiresAt,
    resendAvailableAt,
  }
}

export async function deleteOtpChallenge(email: string, purpose: 'signup' | 'reset_password') {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('email_otps')
    .delete()
    .eq('email', normalizeEmail(email))
    .eq('purpose', purpose)
    .eq('verified', false)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getLatestOtp(email: string, purpose: 'signup' | 'reset_password') {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('email_otps')
    .select('id, email, otp_hash, purpose, expires_at, attempts, verified, resend_available_at, payload')
    .eq('email', normalizeEmail(email))
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<EmailOtpRow>()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

export async function incrementOtpAttempts(otpId: string, attempts: number) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('email_otps')
    .update({ attempts: attempts + 1 })
    .eq('id', otpId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markOtpVerified(otpId: string) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('email_otps')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('id', otpId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markOtpUsed(email: string, purpose: 'signup' | 'reset_password') {
  const supabase = getSupabaseAdminClient()
  await supabase
    .from('email_otps')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('email', normalizeEmail(email))
    .eq('purpose', purpose)
}

export async function createUserFromSignupOtp(email: string, otpRow: EmailOtpRow) {
  const payload = otpRow.payload || {}
  const encryptedPassword = typeof payload.password_cipher === 'string' ? payload.password_cipher : ''
  const fullName = typeof payload.full_name === 'string' ? payload.full_name : ''

  if (!encryptedPassword || !fullName) {
    throw new Error('Signup challenge payload is incomplete. Restart signup.')
  }

  const passwordHash = await hashPassword(decryptSecret(encryptedPassword))
  const name = splitFullName(fullName)
  const supabase = getSupabaseAdminClient()
  const userId = randomUUID()

  const { error } = await supabase.from('users').insert({
    id: userId,
    email: normalizeEmail(email),
    password_hash: passwordHash,
    full_name: name.fullName,
    first_name: name.firstName,
    last_name: name.lastName,
    role: 'voter',
    status: 'active',
    email_verified: true,
  })

  if (error) {
    throw new Error(error.message)
  }

  const user = await getUserById(userId)
  if (!user) {
    throw new Error('Failed to load newly created account.')
  }

  return user
}

export async function updatePasswordForUser(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword)
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      email_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function migrateLegacyPasswordLogin(userRecord: UserRow, password: string) {
  const supabase = getSupabasePublishableClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(userRecord.email),
    password,
  })

  if (error || !data.user) {
    return null
  }

  if (typeof data.user.email !== 'string' || normalizeEmail(data.user.email) !== normalizeEmail(userRecord.email)) {
    return null
  }

  await updatePasswordForUser(userRecord.id, password)
  return getUserRecordByEmail(userRecord.email)
}

export async function setResetCookie(response: NextResponse, email: string, otpId: string) {
  const token = await signSessionToken<Omit<ResetTokenPayload, 'iat' | 'exp'>>(
    {
      type: 'reset',
      email: normalizeEmail(email),
      otp_id: otpId,
    },
    RESET_TOKEN_TTL_SECONDS
  )

  response.cookies.set({
    name: RESET_COOKIE_NAME,
    value: token,
    ...buildCookieOptions(RESET_TOKEN_TTL_SECONDS),
  })
}

export async function readResetCookie() {
  const cookieStore = await cookies()
  const token = cookieStore.get(RESET_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  const payload = await verifySessionToken<ResetTokenPayload>(token)
  if (!payload || payload.type !== 'reset') {
    return null
  }

  return payload
}

function buildOtpEmailHtml(purpose: 'signup' | 'reset_password', otp: string, greeting: string) {
  const title = purpose === 'signup' ? 'Verify your email' : 'Reset your password'
  const body =
    purpose === 'signup'
      ? 'Enter this code to finish creating your BlakVote account.'
      : 'Enter this code to continue resetting your BlakVote password.'
  const footer =
    purpose === 'signup'
      ? 'This code expires in 5 minutes. Do not share it with anyone.'
      : "This code expires in 5 minutes. If you didn't request this, you can ignore this email."

  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:32px 16px;margin:0">' +
    '<div style="max-width:520px;margin:0 auto;background:#121212;border:1px solid #262626;border-radius:20px;padding:32px">' +
    '<p style="margin:0 0 4px;color:#d4af37;font-weight:700;font-size:22px">BlakVote</p>' +
    '<p style="margin:0 0 28px;color:#8a8a8a;font-size:13px">Secure digital voting platform</p>' +
    `<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">${title}</h1>` +
    `<p style="margin:0 0 8px;color:#d4d4d4">${greeting}</p>` +
    `<p style="margin:0 0 24px;color:#a3a3a3">${body}</p>` +
    '<div style="border-radius:18px;border:1px solid rgba(212,175,55,0.24);background:#181818;padding:24px;text-align:center;margin:0 0 24px">' +
    `<div style="font-size:42px;letter-spacing:12px;font-weight:700;color:#d4af37">${otp}</div>` +
    '</div>' +
    `<p style="margin:0;color:#8a8a8a;font-size:13px;line-height:1.6">${footer}</p>` +
    '</div></body></html>'
  )
}

export async function sendOtpEmail(input: {
  email: string
  otp: string
  purpose: 'signup' | 'reset_password'
  fullName?: string
}) {
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_TOKEN || process.env.RESEND_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.')
  }

  const from =
    process.env.OTP_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM ||
    'BlakVote <noreply@mail.blakvote.com>'
  const greeting = input.fullName ? `Hi ${splitFullName(input.fullName).firstName},` : 'Hello,'
  const subject =
    input.purpose === 'signup'
      ? 'Your BlakVote verification code'
      : 'Your BlakVote password reset code'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [normalizeEmail(input.email)],
      subject,
      html: buildOtpEmailHtml(input.purpose, input.otp, greeting),
    }),
  })

  if (!response.ok) {
    const responseText = await response.text()

    if (response.status === 403 && responseText.toLowerCase().includes('domain is not verified')) {
      throw new Error(
        `OTP sender domain is not verified in Resend. Configure OTP_FROM_EMAIL (or RESEND_FROM_EMAIL / RESEND_FROM) with a Resend-verified sender. Current sender: ${from}`
      )
    }

    throw new Error(`Resend API error ${response.status}: ${responseText}`)
  }
}

export async function logAuthEvent(input: {
  action: string
  severity?: 'info' | 'warning' | 'critical'
  userId?: string
  ipAddress?: string
  details: Record<string, unknown>
}) {
  await logAudit({
    action: input.action,
    severity: input.severity || 'info',
    user_id: input.userId,
    ip_address: input.ipAddress,
    details: input.details,
  })
}