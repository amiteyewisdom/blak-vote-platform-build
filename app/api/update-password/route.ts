import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, logRateLimitViolation } from '@/lib/audit-logging'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getPasswordPolicyError,
  getRetryAfterSeconds,
  hasTrustedOrigin,
} from '@/lib/server-security'

interface UpdatePasswordBody {
  email: string
  newPassword: string
}

interface UserIdRow {
  id: string
}

type AuthUserLike = {
  id?: string
  email?: string | null
}

const UPDATE_PASSWORD_WINDOW_MS = 15 * 60 * 1000
const MAX_UPDATE_PASSWORD_PER_IP_WINDOW = 10
const MAX_UPDATE_PASSWORD_PER_EMAIL_WINDOW = 5
const AUTH_LIST_PAGE_SIZE = 100
const AUTH_LIST_MAX_PAGES = 10

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  preferredId?: string
): Promise<AuthUserLike | null> {
  if (preferredId) {
    const authById = await admin.auth.admin.getUserById(preferredId)
    const matchedUser = authById.data.user

    if (
      matchedUser &&
      typeof matchedUser.email === 'string' &&
      matchedUser.email.trim().toLowerCase() === email
    ) {
      return matchedUser
    }

    if (authById.error && !authById.error.message.toLowerCase().includes('not found')) {
      throw new Error(authById.error.message)
    }
  }

  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    })

    if (error) {
      throw new Error(error.message)
    }

    const users = Array.isArray(data?.users) ? data.users : []
    const matchedUser = users.find((user) => {
      if (typeof user.email !== 'string') {
        return false
      }

      return user.email.trim().toLowerCase() === email
    })

    if (matchedUser) {
      return matchedUser
    }

    if (users.length < AUTH_LIST_PAGE_SIZE) {
      break
    }
  }

  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!hasTrustedOrigin(req)) {
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: extractClientIp(req),
        details: { reason: 'Cross-site request blocked.' },
      })

      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body: UpdatePasswordBody = await req.json()
    const { email, newPassword } = body
    const clientIp = extractClientIp(req)

    if (!email || typeof email !== 'string') {
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Missing email address.' },
      })

      return jsonNoStore({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const ipRateLimit = checkRateLimit(`update-password:ip:${clientIp}`, MAX_UPDATE_PASSWORD_PER_IP_WINDOW, UPDATE_PASSWORD_WINDOW_MS)
    const emailRateLimit = checkRateLimit(`update-password:email:${normalizedEmail}`, MAX_UPDATE_PASSWORD_PER_EMAIL_WINDOW, UPDATE_PASSWORD_WINDOW_MS)

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      const retryAfterMs = Math.max(ipRateLimit.retryAfterMs, emailRateLimit.retryAfterMs)
      await logRateLimitViolation('app/api/update-password', clientIp, MAX_UPDATE_PASSWORD_PER_IP_WINDOW)
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Rate limit exceeded.', email: normalizedEmail },
      })

      return jsonNoStore(
        { error: 'Too many password reset attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    if (!newPassword || typeof newPassword !== 'string') {
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Missing new password.', email: normalizedEmail },
      })

      return jsonNoStore({ error: 'A new password is required.' }, { status: 400 })
    }

    const passwordPolicyError = getPasswordPolicyError(newPassword)
    if (passwordPolicyError) {
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: passwordPolicyError, email: normalizedEmail },
      })

      return jsonNoStore({ error: passwordPolicyError }, { status: 400 })
    }

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
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'Password reset session expired.', email: normalizedEmail },
      })

      return jsonNoStore(
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
      await logAudit({
        action: 'PASSWORD_RESET_FAILED',
        severity: 'warning',
        ip_address: clientIp,
        details: { reason: 'No account found.', email: normalizedEmail },
      })

      return jsonNoStore({ error: 'No account found with this email.' }, { status: 404 })
    }

    const authUser = await findAuthUserByEmail(admin, normalizedEmail, userData.id)

    if (authUser && authUser.id && authUser.id !== userData.id) {
      throw new Error('Account setup mismatch detected. Please contact support.')
    }

    if (!authUser) {
      const { error: createError } = await admin.auth.admin.createUser({
        id: userData.id,
        email: normalizedEmail,
        password: newPassword,
        email_confirm: true,
      })

      if (createError) {
        throw new Error(createError.message)
      }
    } else {
      const { error: updateError } = await admin.auth.admin.updateUserById(userData.id, {
        password: newPassword,
        email_confirm: true,
      })
      if (updateError) throw new Error(updateError.message)
    }

    // Clean up all reset OTPs for this email
    await admin.from('email_otps').delete().eq('email', normalizedEmail).eq('type', 'reset')

    return jsonNoStore({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update password.'
    console.error('[update-password]', message)
    await logAudit({
      action: 'PASSWORD_RESET_FAILED',
      severity: 'warning',
      ip_address: extractClientIp(req),
      details: { reason: message },
    })
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
