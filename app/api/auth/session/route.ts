import { NextResponse } from 'next/server'
import {
  buildClientSession,
  clearAuthCookies,
  getAuthenticatedSession,
  rotateUserSession,
} from '@/lib/auth/server-auth'
import { applyNoStoreHeaders, extractClientIp } from '@/lib/server-security'

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession()
    const response = applyNoStoreHeaders(NextResponse.json(buildClientSession(session.user)))

    if (!session.user || !session.sessionId) {
      await clearAuthCookies(response)
      return response
    }

    if (session.source === 'refresh') {
      await rotateUserSession(response, session.user, session.sessionId, {
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
      })
    }

    return response
  } catch {
    const response = applyNoStoreHeaders(NextResponse.json({ authenticated: false, user: null }))
    await clearAuthCookies(response)
    return response
  }
}