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

  if (!isAppHost) {
    redirect('/events')
  }

  if (REDIRECT_AUTHENTICATED_APP_USERS) {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect('/organizer')
    }
  }

  const primaryCtaHref = isAppHost ? '/contact' : '/contact'
  const primaryCtaLabel = 'Contact Us'
  const secondaryCtaHref = isAppHost ? '/contact' : '/contact'
  const secondaryCtaLabel = 'Request Account Access'

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNav
        actions={
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:gap-3">
            <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
              <Link href="/auth/sign-in">Sign In</Link>
            </Button>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href={primaryCtaHref}>{primaryCtaLabel}</Link>
            </Button>
          </div>
        }
      />

      <section className="relative flex flex-1 items-center overflow-hidden px-4 py-14 sm:px-0 sm:py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.26),transparent_62%)] blur-3xl sm:h-[42rem] sm:w-[42rem]" />
          <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_68%)] blur-3xl sm:h-80 sm:w-80" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl text-center sm:px-6">
          <span className="inline-flex rounded-full border border-gold/25 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold shadow-sm sm:px-4 sm:py-2 sm:text-sm">
            Premium digital voting for modern organizations
          </span>
          <h1 className="type-display mt-6 bg-gradient-to-r from-gold via-foreground to-gold-deep bg-clip-text text-3xl leading-tight text-transparent sm:mt-8 sm:text-5xl md:text-7xl">
            The Future of Digital Voting
          </h1>
          <p className="mx-auto mb-8 mt-4 max-w-3xl text-base font-medium leading-relaxed text-muted-foreground sm:mb-ds-10 sm:mt-6 sm:px-2 sm:text-xl md:text-2xl">
            BlakVote combines payment integrity, clear governance, and enterprise-grade operator tooling in one coherent platform.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-5">
            <Button asChild size="lg" className="h-12 w-full text-base sm:h-14 sm:w-auto sm:text-lg">
              <Link href={primaryCtaHref}>
                {primaryCtaLabel} <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-12 w-full text-base sm:h-14 sm:w-auto sm:text-lg">
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border/70 bg-surface/70 py-12 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground sm:mb-14 sm:text-4xl">
            Why teams choose BlakVote
          </h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 md:gap-10">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <Card key={feature.title} className="flex flex-col gap-4 p-5 sm:flex-row sm:gap-5 sm:p-ds-6">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gold/12 text-gold sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-bold text-card-foreground sm:text-xl">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{feature.description}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-24">
        <Card className="mx-auto max-w-3xl p-6 text-center sm:p-ds-14">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-card-foreground sm:text-4xl">Ready to run a sharper election?</h2>
          <p className="mx-auto mb-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:mb-8 sm:text-lg">
            Launch secure paid or free voting experiences with cleaner operations and clearer participant trust.
          </p>
          <Button asChild size="lg" className="h-12 w-full text-base sm:h-14 sm:w-auto sm:text-lg">
            <Link href={secondaryCtaHref}>{secondaryCtaLabel}</Link>
          </Button>
        </Card>
      </section>

      <footer className="mt-auto border-t border-border/70 bg-surface/60 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6">
          <p>&copy; 2026 BlakVote. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
