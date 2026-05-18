import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth/server-auth'

export async function POST(request: NextRequest) {
  try {
    // Require both development mode and an explicit feature flag for safer production deployments.
    if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_TEST_USER_SETUP !== 'true') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sessionClient = await createServerClient()
    const auth = await requireRole(sessionClient, ['admin'])
    if (!auth.ok) {
      return auth.response
    }

    const admin = sessionClient

    // Test users to create
    const testUsers = [
      {
        email: 'admin@blakvote.test',
        password: 'admin123456',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'Tester',
      },
      {
        email: 'organizer@blakvote.test',
        password: 'organizer123456',
        role: 'organizer',
        firstName: 'Organizer',
        lastName: 'Tester',
      },
    ]

    const results = []

    for (const user of testUsers) {
      try {
        const passwordHash = await hashPassword(user.password)
        const fullName = `${user.firstName} ${user.lastName}`.trim()
        const { data: existingUser } = await admin
          .from('users')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()

        const payload = {
          email: user.email,
          role: user.role,
          full_name: fullName,
          first_name: user.firstName,
          last_name: user.lastName,
          password_hash: passwordHash,
          email_verified: true,
          status: 'active',
        }

        const operation = existingUser?.id
          ? admin.from('users').update(payload).eq('id', existingUser.id)
          : admin.from('users').insert({ id: crypto.randomUUID(), ...payload })

        const { error: dbError } = await operation

        if (dbError) {
          results.push({
            email: user.email,
            success: false,
            error: dbError.message,
          })
          continue
        }

        results.push({
          email: user.email,
          success: true,
          // Do not return plaintext credentials in API responses.
          password: '[REDACTED]',
        })
      } catch (error: any) {
        results.push({
          email: user.email,
          success: false,
          error: error.message,
        })
      }
    }

    return NextResponse.json(
      {
        message: 'Test users setup completed',
        results,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Test user setup error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create test users' },
      { status: 500 }
    )
  }
}
