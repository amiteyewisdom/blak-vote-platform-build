'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { DSInput } from '@/components/ui/design-system'
import { Button } from '@/components/ui/button'
import BrandLogo from '@/components/BrandLogo'
import { Sparkles } from 'lucide-react'

export default function SignUpPage() {
  const router = useRouter()
  const { toast } = useToast()
  const refreshPage = () => {
    window.location.reload()
  }

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!email || !password) {
      toast({ title: 'Validation', description: 'Email and password required', variant: 'destructive' })
      return
    }
    if (password !== confirmPassword) {
      toast({ title: 'Validation', description: 'Passwords do not match', variant: 'destructive' })
      return
    }
    if (password.length < 8) {
      toast({ title: 'Validation', description: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }

    setLoading(true)
    const role = 'voter'

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, first_name: firstName, last_name: lastName, phone_number: phone },
      },
    })

    if (error) {
      toast({ title: 'Signup error', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        status: 'active',
      })
    }

    setLoading(false)
    toast({ title: 'Account created!', description: 'Welcome to BlakVote. Sign in to continue.' })
    router.push('/auth/sign-in')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-12rem] top-[-12rem] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-12rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-xl rounded-3xl border border-border/70 bg-card/95 p-8 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-12">
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={refreshPage}
            aria-label="Refresh page"
            className="flex w-full items-center justify-center"
          >
            <BrandLogo size="lg" centered className="justify-center" />
          </button>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Create Voter Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Join BlakVote to vote in events and nominate candidates</p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold/20 bg-gold/10 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold" />
          <div>
            <p className="text-sm font-medium text-gold">Want to organize events?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create a voter account first, then{' '}
              <Link href="/apply-organizer" className="text-gold underline">apply to be an organizer</Link>.
              Admin approval is required.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <DSInput
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value.slice(0, 100))}
              className="h-12 rounded-2xl"
            />
            <DSInput
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value.slice(0, 100))}
              className="h-12 rounded-2xl"
            />
          </div>
          <DSInput
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 255))}
            className="h-12 rounded-2xl"
          />
          <DSInput
            type="tel"
            placeholder="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\-\s]/g, '').slice(0, 20))}
            className="h-12 rounded-2xl"
          />
          <DSInput
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-2xl"
          />
          <DSInput
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-2xl"
          />
          <Button
            onClick={handleSignup}
            disabled={loading}
            className="w-full h-12"
          >
            {loading ? 'Creating Account...' : 'Create Voter Account'}
          </Button>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="font-medium text-gold transition hover:opacity-80">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
