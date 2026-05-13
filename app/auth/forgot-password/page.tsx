'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/auth'

const RESET_REDIRECT_URL = 'https://app.blakvote.com/auth/reset-password'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter your email address.')
      return
    }

    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: RESET_REDIRECT_URL,
      })

      if (resetError) throw resetError

      setSent(true)
    } catch (resetException) {
      const message =
        resetException instanceof Error ? resetException.message : 'Failed to send reset email.'
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
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Forgot password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we will send a reset link.
          </p>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {sent ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 size={36} className="text-emerald-400" />
              <p className="text-sm text-emerald-300">
                Reset link sent to{' '}
                <span className="font-semibold">{email.trim().toLowerCase()}</span>.
                Check your inbox and follow the link to set a new password.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm text-foreground/70">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
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
                {loading ? 'Sending reset link...' : 'Send reset link'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
