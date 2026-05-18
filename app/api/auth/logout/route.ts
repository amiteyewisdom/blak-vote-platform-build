import { NextResponse } from 'next/server'
import { clearAuthCookies, invalidateCurrentSession } from '@/lib/auth/server-auth'
import { applyNoStoreHeaders, hasTrustedOrigin } from '@/lib/server-security'

export async function POST(request: Request) {
  const response = applyNoStoreHeaders(NextResponse.json({ success: true }))

  if (!hasTrustedOrigin(request)) {
    return applyNoStoreHeaders(NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 }))
  }

  await invalidateCurrentSession()
  await clearAuthCookies(response)

  return response
}