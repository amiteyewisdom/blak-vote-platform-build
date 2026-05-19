import { NextRequest, NextResponse } from 'next/server'
import { getRedirectPathForRole } from '@/lib/auth/role-routing'
import {
  buildClientSession,
  getUserRecordByEmail,
  logAuthEvent,
  migrateLegacyPasswordLogin,
  normalizeEmail,
  startUserSession,
  verifyPassword,
} from '@/lib/auth/server-auth'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

type LoginBody = {
  email: string
  password: string
}

const LOGIN_WINDOW_MS = 10 * 60 * 1000
const MAX_LOGIN_ATTEMPTS_PER_IP = 20
const MAX_LOGIN_ATTEMPTS_PER_EMAIL = 8

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

function normalizeAccountStatus(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase()
}

function canSignInWithStatus(status: string | null | undefined) {
  const normalized = normalizeAccountStatus(status)
  return !normalized || normalized === 'active' || normalized === 'approved'
}

function getUnavailableAccountMessage(status: string | null | undefined) {
  const normalized = normalizeAccountStatus(status)

  if (normalized === 'suspended') {
    return 'This account is suspended. Contact support for help.'
  }

  if (normalized === 'deleted') {
    return 'This account has been removed. Contact support for help.'
  }

  return 'This account is currently unavailable.'
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body = (await request.json()) as Partial<LoginBody>
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return jsonNoStore({ error: 'Email and password are required.' }, { status: 400 })
    }

    const ipLimit = checkRateLimit(`auth:login:ip:${ipAddress}`, MAX_LOGIN_ATTEMPTS_PER_IP, LOGIN_WINDOW_MS)
    const emailLimit = checkRateLimit(`auth:login:email:${email}`, MAX_LOGIN_ATTEMPTS_PER_EMAIL, LOGIN_WINDOW_MS)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs)
      return jsonNoStore(
        { error: 'Too many login attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    let userRecord = await getUserRecordByEmail(email)
    if (!userRecord) {
      await logAuthEvent({
        action: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        ipAddress,
        details: { reason: 'missing_user', email },
      })
      return jsonNoStore({ error: 'Email or password is incorrect.' }, { status: 401 })
    }

    if (!canSignInWithStatus(userRecord.status)) {
      await logAuthEvent({
        action: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        userId: userRecord.id,
        ipAddress,
        details: { reason: 'inactive_user', email, status: userRecord.status },
      })
      return jsonNoStore({ error: getUnavailableAccountMessage(userRecord.status) }, { status: 403 })
    }

    if (!userRecord.password_hash) {
      const migratedUser = await migrateLegacyPasswordLogin(userRecord, password)

      if (migratedUser?.password_hash) {
        userRecord = migratedUser

        await logAuthEvent({
          action: 'AUTH_LOGIN_LEGACY_PASSWORD_MIGRATED',
          userId: userRecord.id,
          ipAddress,
          details: { email },
        })
      }
    }

    if (!userRecord.password_hash) {
      await logAuthEvent({
        action: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        userId: userRecord.id,
        ipAddress,
        details: { reason: 'missing_password_hash', email },
      })
      return jsonNoStore({ error: 'This account is not ready for password login yet. Reset your password to continue.' }, { status: 403 })
    }

    const passwordMatches = await verifyPassword(password, userRecord.password_hash)
    if (!passwordMatches) {
      await logAuthEvent({
        action: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        userId: userRecord.id,
        ipAddress,
        details: { reason: 'invalid_password', email },
      })
      return jsonNoStore({ error: 'Email or password is incorrect.' }, { status: 401 })
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      role: (userRecord.role === 'admin' || userRecord.role === 'organizer' || userRecord.role === 'voter' ? userRecord.role : 'voter'),
      fullName: userRecord.full_name || [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ').trim() || userRecord.email,
      firstName: userRecord.first_name || null,
      lastName: userRecord.last_name || null,
      status: userRecord.status || 'active',
      emailVerified: userRecord.email_verified === true,
    } as const

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
      action: 'AUTH_LOGIN_SUCCEEDED',
      userId: user.id,
      ipAddress,
      details: { email, role: user.role },
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.'
    await logAuthEvent({
      action: 'AUTH_LOGIN_ERROR',
      severity: 'warning',
      ipAddress,
      details: { message },
    })
    return jsonNoStore({ error: message }, { status: 500 })
  }
}