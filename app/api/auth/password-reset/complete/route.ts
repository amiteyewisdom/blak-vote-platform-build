import { NextRequest, NextResponse } from 'next/server'
import { getRedirectPathForRole } from '@/lib/auth/role-routing'
import {
  buildClientSession,
  clearAuthCookies,
  getUserRecordByEmail,
  invalidateAllUserSessions,
  logAuthEvent,
  markOtpVerified,
  normalizeEmail,
  readResetCookie,
  startUserSession,
  updatePasswordForUser,
} from '@/lib/auth/server-auth'
import {
  applyNoStoreHeaders,
  extractClientIp,
  getPasswordPolicyError,
  hasTrustedOrigin,
} from '@/lib/server-security'

type PasswordResetCompleteBody = {
  password: string
}

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  return applyNoStoreHeaders(NextResponse.json(body, init))
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request)

  try {
    if (!hasTrustedOrigin(request)) {
      return jsonNoStore({ error: 'Cross-site request blocked.' }, { status: 403 })
    }

    const resetState = await readResetCookie()
    if (!resetState) {
      return jsonNoStore({ error: 'Password reset session expired. Request a new code.' }, { status: 400 })
    }

    const body = (await request.json()) as Partial<PasswordResetCompleteBody>
    const password = typeof body.password === 'string' ? body.password : ''
    const passwordError = getPasswordPolicyError(password)
    if (passwordError) {
      return jsonNoStore({ error: passwordError }, { status: 400 })
    }

    const userRecord = await getUserRecordByEmail(normalizeEmail(resetState.email))
    if (!userRecord) {
      return jsonNoStore({ error: 'No account was found for this reset session.' }, { status: 404 })
    }

    await updatePasswordForUser(userRecord.id, password)
    await invalidateAllUserSessions(userRecord.id)
    await markOtpVerified(resetState.otp_id)

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      role: (userRecord.role === 'admin' || userRecord.role === 'organizer' || userRecord.role === 'voter' ? userRecord.role : 'voter'),
      fullName: userRecord.full_name || [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ').trim() || userRecord.email,
      firstName: userRecord.first_name || null,
      lastName: userRecord.last_name || null,
      status: userRecord.status || 'active',
      emailVerified: true,
    } as const

    const response = jsonNoStore({
      success: true,
      ...buildClientSession(user),
      redirectTo: getRedirectPathForRole(user.role),
    })

    await clearAuthCookies(response)
    await startUserSession(response, user, {
      ipAddress,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    await logAuthEvent({
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      userId: user.id,
      ipAddress,
      details: { email: user.email },
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete password reset.'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}