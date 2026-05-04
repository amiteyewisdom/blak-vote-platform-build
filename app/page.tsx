import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PublicNav from '@/components/PublicNav'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ArrowRight, CheckCircle, Lock, BarChart3, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

const REDIRECT_AUTHENTICATED_APP_USERS = false

const features = [
  {
    icon: Lock,
    title: 'Military-Grade Security',
    description:
      'End-to-end encrypted votes with verification controls designed for regulated, high-trust elections.',
  },
  {
    icon: Users,
    title: 'Multi-Role Support',
    description:
      'Dedicated admin, organizer, and voter journeys with consistent permissions and guardrails.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description:
      'Live dashboards surface turnout, revenue, and result movement without overwhelming the operator.',
  },
  {
    icon: CheckCircle,
    title: 'Fraud Detection',
    description:
      'Payment verification, device checks, and operational safeguards reduce abuse without slowing the flow.',
  },
]

function getRequestHostname(headerValue: string | null) {
  return headerValue?.split(',')[0]?.trim().toLowerCase() ?? ''
}

export default async function HomePage() {
  const requestHeaders = await headers()
  const hostname = getRequestHostname(
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  )
  const isAppHost = hostname.startsWith('app.')

  if (isAppHost && REDIRECT_AUTHENTICATED_APP_USERS) {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect('/organizer')
    }
  }

  const primaryCtaHref = isAppHost ? '/auth/sign-in' : '/sign-up'
  const primaryCtaLabel = isAppHost ? 'Sign In' : 'Get Started'
  const secondaryCtaHref = isAppHost ? '/auth/sign-in' : '/sign-up'
  const secondaryCtaLabel = isAppHost ? 'Go to Login' : 'Create Your Account'

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNav
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
              <Link href="/auth/sign-in">Sign In</Link>
            </Button>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href={primaryCtaHref}>{primaryCtaLabel}</Link>
            </Button>
          </div>
        }
      />

      <section className="relative flex flex-1 items-center overflow-hidden py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.26),transparent_62%)] blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_68%)] blur-3xl" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
          <span className="inline-flex rounded-full border border-gold/25 bg-gold/10 px-4 py-2 text-sm font-medium text-gold shadow-sm">
            Premium digital voting for modern organizations
          </span>
          <h1 className="type-display mt-8 bg-gradient-to-r from-gold via-foreground to-gold-deep bg-clip-text text-4xl text-transparent sm:text-5xl md:text-7xl">
            The Future of Digital Voting
          </h1>
          <p className="mx-auto mb-ds-8 mt-6 max-w-3xl px-2 text-lg font-medium text-muted-foreground sm:mb-ds-10 sm:text-xl md:text-2xl">
            BlakVote combines payment integrity, clear governance, and enterprise-grade operator tooling in one coherent platform.
          </p>
          <div className="flex flex-col justify-center gap-5 sm:flex-row">
            <Button asChild size="lg" className="text-lg">
              <Link href={primaryCtaHref}>
                {primaryCtaLabel} <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="text-lg">
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border/70 bg-surface/70 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground sm:mb-14 sm:text-4xl">
            Why teams choose BlakVote
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:gap-10">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <Card key={feature.title} className="flex gap-5 p-ds-6">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gold/12 text-gold">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xl font-bold text-card-foreground">{feature.title}</h3>
                    <p className="text-base text-muted-foreground">{feature.description}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <Card className="mx-auto max-w-3xl p-ds-8 text-center sm:p-ds-14">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-card-foreground sm:text-4xl">Ready to run a sharper election?</h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            Launch secure paid or free voting experiences with cleaner operations and clearer participant trust.
          </p>
          <Button asChild size="lg" className="text-lg">
            <Link href={secondaryCtaHref}>{secondaryCtaLabel}</Link>
          </Button>
        </Card>
      </section>

      <footer className="mt-auto border-t border-border/70 bg-surface/60 py-12">
        <div className="mx-auto max-w-7xl px-6 text-center text-muted-foreground">
          <p>&copy; 2026 BlakVote. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
