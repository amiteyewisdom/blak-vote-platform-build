import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Admin client for creating users
const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, serviceKey)
}

export async function POST(request: NextRequest) {
  try {
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
      {
        email: 'voter1@blakvote.test',
        password: 'voter123456',
        role: 'voter',
        firstName: 'Voter',
        lastName: 'One',
      },
      {
        email: 'voter2@blakvote.test',
        password: 'voter123456',
        role: 'voter',
        firstName: 'Voter',
        lastName: 'Two',
      },
      {
        email: 'voter3@blakvote.test',
        password: 'voter123456',
        role: 'voter',
        firstName: 'Voter',
        lastName: 'Three',
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
          password: user.password,
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
