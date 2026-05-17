import { NextRequest, NextResponse } from 'next/server'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL } from '@/lib/support-contact'
import {
  applyNoStoreHeaders,
  checkRateLimit,
  extractClientIp,
  getRetryAfterSeconds,
  getSupabaseAdminClient,
  hasTrustedOrigin,
} from '@/lib/server-security'

interface LoginDiagnosticsBody {
  email: string
}

interface ProfileRow {
  id: string
  status: string | null
}

type AuthUserLike = {
  id?: string
  email?: string | null
  email_confirmed_at?: string | null
}

const DIAGNOSTIC_WINDOW_MS = 10 * 60 * 1000
const MAX_DIAGNOSTICS_PER_IP_WINDOW = 20
const MAX_DIAGNOSTICS_PER_EMAIL_WINDOW = 8
const AUTH_LIST_PAGE_SIZE = 100
const AUTH_LIST_MAX_PAGES = 10

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

async function findAuthUserByEmail(email: string, profileId?: string | null): Promise<AuthUserLike | null> {
  const admin = getSupabaseAdminClient()

  if (profileId) {
    const authById = await admin.auth.admin.getUserById(profileId)
    const matchedUser = authById.data.user

    if (
      matchedUser &&
      typeof matchedUser.email === 'string' &&
      matchedUser.email.trim().toLowerCase() === email
    ) {
      return matchedUser
    }
  }

  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    })

    if (error) {
      throw error
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

function getSupportMessage() {
  return `Contact ${SUPPORT_EMAIL} or ${SUPPORT_WHATSAPP_LABEL} for help.`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!hasTrustedOrigin(req)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const body: LoginDiagnosticsBody = await req.json()
    const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!normalizedEmail) {
      return jsonNoStore({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const clientIp = extractClientIp(req)
    const ipRateLimit = checkRateLimit(
      `login-diagnostics:ip:${clientIp}`,
      MAX_DIAGNOSTICS_PER_IP_WINDOW,
      DIAGNOSTIC_WINDOW_MS
    )
    const emailRateLimit = checkRateLimit(
      `login-diagnostics:email:${normalizedEmail}`,
      MAX_DIAGNOSTICS_PER_EMAIL_WINDOW,
      DIAGNOSTIC_WINDOW_MS
    )

    if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
      const retryAfterMs = Math.max(ipRateLimit.retryAfterMs, emailRateLimit.retryAfterMs)
      return jsonNoStore(
        {
          message:
            'Email or password is incorrect. If you recently changed your password, try again or reset it.',
        },
        {
          status: 429,
          headers: { 'Retry-After': getRetryAfterSeconds(retryAfterMs) },
        }
      )
    }

    const admin = getSupabaseAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('id, status')
      .eq('email', normalizedEmail)
      .maybeSingle<ProfileRow>()

    if (profileError) {
      throw new Error(profileError.message)
    }

    const authUser = await findAuthUserByEmail(normalizedEmail, profile?.id)

    if (profile?.status && profile.status !== 'active') {
      return jsonNoStore({
        message: `This account is currently unavailable. ${getSupportMessage()}`,
      })
    }

    if (profile && !authUser) {
      return jsonNoStore({
        message: `Your account setup is incomplete for password sign-in. ${getSupportMessage()}`,
      })
    }

    if (authUser && !profile) {
      return jsonNoStore({
        message: `Your sign-in exists, but your app profile is missing. ${getSupportMessage()}`,
      })
    }

    if (authUser && !authUser.email_confirmed_at) {
      return jsonNoStore({
        message: `Your account email is not confirmed yet. Reset your password or ${getSupportMessage().toLowerCase()}`,
      })
    }

    return jsonNoStore({
      message:
        'Email or password is incorrect. If you recently changed your password, try again or reset it.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login diagnostics failed.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}