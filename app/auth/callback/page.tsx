'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { AlertCircle, Loader2 } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { supabase } from '@/lib/auth'
import { getAuthenticatedUserRole, getRedirectPathForRole } from '@/lib/auth/role-routing'

const VALID_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

function isEmailOtpType(value: string | null): value is EmailOtpType {
  if (!value) {
    return false
  }

  return VALID_OTP_TYPES.some((otpType) => otpType === value)
}

export default function AuthCallbackPage() {
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  const code = useMemo(() => searchParams.get('code'), [searchParams])
  const tokenHash = useMemo(() => searchParams.get('token_hash'), [searchParams])
  const type = useMemo(() => searchParams.get('type'), [searchParams])

  useEffect(() => {
    let cancelled = false

    const completeSignIn = async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            throw exchangeError
          }
        } else if (tokenHash && isEmailOtpType(type)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          })

          if (verifyError) {
            throw verifyError
          }
        } else {
          throw new Error('The authentication link is invalid or has expired.')
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          throw new Error('Authentication succeeded but no user session was found.')
        }

        const role = await getAuthenticatedUserRole(supabase, user)
        const nextPath = getRedirectPathForRole(role)

        if (!cancelled) {
          window.location.replace(nextPath)
        }
      } catch (authError) {
        if (!cancelled) {
          const message =
            authError instanceof Error ? authError.message : 'Failed to complete authentication.'
          setError(message)
        }
      }
    }

    void completeSignIn()

    return () => {
      cancelled = true
    }
  }, [code, tokenHash, type])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Completing sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Finalizing your secure OTP session.</p>
        </div>

        {!error ? (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-background/70 p-4 text-sm text-foreground/80">
            <Loader2 size={18} className="animate-spin" />
            Verifying authentication...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle size={18} className="mt-0.5" />
              <span>{error}</span>
            </div>
            <Link
              href="/auth/login"
              className="inline-flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
            >
              Return to login
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
