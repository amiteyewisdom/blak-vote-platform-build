import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server-security'
import {
  getAuthenticatedUser,
  startUserSession,
  type AuthenticatedUser,
} from '@/lib/auth/server-auth'

export async function POST(req: NextRequest) {
  const currentUser = await getAuthenticatedUser()

  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSupabase = getSupabaseAdminClient()

  const { data: adminRow } = await adminSupabase
    .from('users')
    .select('is_super_admin')
    .eq('id', currentUser.id)
    .maybeSingle()

  if (!adminRow?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin privileges required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''

  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
  }

  const { data: targetRow, error: targetError } = await adminSupabase
    .from('users')
    .select('id, email, role, full_name, first_name, last_name, status, email_verified')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetError || !targetRow) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
  }

  if (targetRow.status === 'suspended') {
    return NextResponse.json({ error: 'Cannot impersonate a suspended account' }, { status: 400 })
  }

  const validRoles = ['admin', 'organizer', 'voter'] as const
  type AppRole = (typeof validRoles)[number]
  const role: AppRole = validRoles.includes(targetRow.role as AppRole)
    ? (targetRow.role as AppRole)
    : 'voter'

  const firstName = targetRow.first_name || null
  const lastName = targetRow.last_name || null
  const fullName = targetRow.full_name || [firstName, lastName].filter(Boolean).join(' ') || targetRow.email

  const targetUser: AuthenticatedUser = {
    id: targetRow.id,
    email: targetRow.email,
    role,
    fullName,
    firstName,
    lastName,
    status: targetRow.status || 'active',
    emailVerified: Boolean(targetRow.email_verified),
  }

  const response = NextResponse.json({
    success: true,
    redirectTo: role === 'admin' ? '/admin' : role === 'organizer' ? '/organizer' : '/voter',
  })

  await startUserSession(response, targetUser, {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    userAgent: req.headers.get('user-agent') || undefined,
  })

  return response
}
