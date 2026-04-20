import { createClient as createAdminSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Admin client for creating users
const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createAdminSupabaseClient(url, serviceKey)
}

export async function POST(request: NextRequest) {
  try {
    // Require both development mode and an explicit feature flag for safer production deployments.
    if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_TEST_USER_SETUP !== 'true') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sessionClient = await createServerClient()

    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: actor, error: actorError } = await sessionClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (actorError || actor?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = getAdminClient()

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
        // Create user in Supabase Auth
        const { data: authUser, error: authError } = await admin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
        })

        if (authError) {
          results.push({
            email: user.email,
            success: false,
            error: authError.message,
          })
          continue
        }

        // Create user profile in database
        const { error: dbError } = await admin
          .from('users')
          .insert({
            id: authUser.user.id,
            email: user.email,
            role: user.role,
            first_name: user.firstName,
            last_name: user.lastName,
            status: 'active',
          })

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
          userId: authUser.user.id,
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
