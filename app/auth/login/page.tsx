'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Mail } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/auth'

const AUTH_CALLBACK_URL =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? 'https://app.blakvote.com/auth/callback'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter your email address to receive a verification code.')
      return
    }

    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: AUTH_CALLBACK_URL,
        },
      })

      if (otpError) {
        throw otpError
      }

      setSuccessMessage('A verification code has been sent to your inbox.')
      router.push(`/auth/verify?email=${encodeURIComponent(normalizedEmail)}`)
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Failed to send verification code.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Sign in with OTP</h1>
          <p className="mt-2 text-sm text-muted-foreground">Get a one-time code sent to your email.</p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-foreground/70">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background/70 pl-11 pr-4 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="name@company.com"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? 'Sending code...' : 'Send verification code'}
            {!loading ? <ArrowRight size={18} className="ml-2" /> : null}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Prefer password sign in?{' '}
          <Link href="/auth/sign-in" className="font-medium text-gold transition hover:opacity-80">
            Use password login
          </Link>
        </div>
      </div>
    </div>
  )
}
