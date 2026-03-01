import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const testUsers = [
  {
    email: 'admin@blakvote.test',
    password: 'admin123',
    role: 'admin',
    firstName: 'Admin',
    lastName: 'Tester',
  },
  {
    email: 'organizer@blakvote.test',
    password: 'organizer123',
    role: 'organizer',
    firstName: 'Organizer',
    lastName: 'Tester',
  },
  {
    email: 'voter1@blakvote.test',
    password: 'voter123',
    role: 'voter',
    firstName: 'Voter',
    lastName: 'One',
  },
  {
    email: 'voter2@blakvote.test',
    password: 'voter123',
    role: 'voter',
    firstName: 'Voter',
    lastName: 'Two',
  },
  {
    email: 'voter3@blakvote.test',
    password: 'voter123',
    role: 'voter',
    firstName: 'Voter',
    lastName: 'Three',
  },
]

async function setupTestUsers() {
  console.log('Creating test users...')

  for (const user of testUsers) {
    try {
      // Create auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      })

      if (authError) {
        console.error(`Failed to create auth user ${user.email}:`, authError.message)
        continue
      }

      console.log(`✓ Created auth user: ${user.email}`)

      // Create user profile
      const { error: profileError } = await supabase.from('users').insert({
        id: authUser.user.id,
        email: user.email,
        role: user.role,
        first_name: user.firstName,
        last_name: user.lastName,
        status: 'active',
      })

      if (profileError) {
        console.error(`Failed to create user profile for ${user.email}:`, profileError.message)
        continue
      }

      console.log(`✓ Created user profile: ${user.email} (${user.role})`)
    } catch (error) {
      console.error(`Error setting up user ${user.email}:`, error)
    }
  }

  console.log('\nTest user setup complete!')
  console.log('\nYou can now log in with:')
  testUsers.forEach((user) => {
    console.log(`  Email: ${user.email} | Password: ${user.password}`)
  })
}

setupTestUsers()
