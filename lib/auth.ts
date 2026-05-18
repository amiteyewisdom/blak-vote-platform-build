import { createOptionalBrowserClient } from '@/lib/supabase/client-config'

type SessionUser = {
  id: string
  email: string
  role: 'admin' | 'organizer' | 'voter'
  fullName: string
  firstName: string | null
  lastName: string | null
  status: string
  emailVerified: boolean
}

type SessionPayload = {
  authenticated: boolean
  user: SessionUser | null
}

type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'INITIAL_SESSION'

const baseClient = createOptionalBrowserClient({
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const subscribers = new Set<(event: AuthChangeEvent, session: { user: ReturnType<typeof toAuthUser> } | null) => void>()

function toAuthUser(user: SessionUser | null) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    user_metadata: {
      role: user.role,
      status: user.status,
      full_name: user.fullName,
      first_name: user.firstName,
      last_name: user.lastName,
      email_verified: user.emailVerified,
    },
  }
}

function emit(event: AuthChangeEvent, user: SessionUser | null) {
  const session = user ? { user: toAuthUser(user) } : null
  for (const callback of subscribers) {
    callback(event, session)
  }
}

async function requestSession(): Promise<SessionPayload> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  })

  if (!response.ok) {
    return {
      authenticated: false,
      user: null,
    }
  }

  return response.json()
}

export const supabase = Object.assign(baseClient, {
  auth: {
    async getUser() {
      const session = await requestSession()
      return {
        data: { user: toAuthUser(session.user) },
        error: null,
      }
    },
    async getSession() {
      const session = await requestSession()
      return {
        data: {
          session: session.authenticated
            ? {
                access_token: null,
                refresh_token: null,
                user: toAuthUser(session.user),
              }
            : null,
        },
        error: null,
      }
    },
    async refreshSession() {
      const session = await requestSession()
      emit('TOKEN_REFRESHED', session.user)
      return {
        data: {
          session: session.authenticated
            ? {
                access_token: null,
                refresh_token: null,
                user: toAuthUser(session.user),
              }
            : null,
        },
        error: null,
      }
    },
    async signInWithPassword(input: { email: string; password: string }) {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          data: { user: null, session: null },
          error: new Error(String(payload?.error || 'Failed to sign in.')),
        }
      }

      emit('SIGNED_IN', payload.user ?? null)

      return {
        data: {
          user: toAuthUser(payload.user ?? null),
          session: payload.user
            ? {
                access_token: null,
                refresh_token: null,
                user: toAuthUser(payload.user),
              }
            : null,
        },
        error: null,
      }
    },
    async signOut() {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      emit('SIGNED_OUT', null)
      return { error: null }
    },
    async updateUser() {
      return { data: { user: null }, error: new Error('User updates are not supported from the client auth wrapper.') }
    },
    async signUp() {
      return { data: { user: null, session: null }, error: new Error('Use the custom signup flow.') }
    },
    async resetPasswordForEmail() {
      return { data: null, error: new Error('Use the custom password reset flow.') }
    },
    async exchangeCodeForSession() {
      return { error: new Error('Email magic link auth is disabled.') }
    },
    async verifyOtp() {
      return { error: new Error('Supabase OTP auth is disabled.') }
    },
    onAuthStateChange(callback: (event: AuthChangeEvent, session: { user: ReturnType<typeof toAuthUser> } | null) => void) {
      subscribers.add(callback)
      void requestSession().then((session) => {
        callback('INITIAL_SESSION', session.user ? { user: toAuthUser(session.user) } : null)
      })
      return {
        data: {
          subscription: {
            unsubscribe() {
              subscribers.delete(callback)
            },
          },
        },
      }
    },
  },
})