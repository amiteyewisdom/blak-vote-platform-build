'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OrganizerApplicationForm from '@/components/OrganizerApplicationForm'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabaseClient'
import { BadgeCheck, ClipboardList, Vote, WalletCards } from 'lucide-react'

type ApplicationStatus = {
  id: string
  status: string
  submitted_at?: string | null
  reviewed_at?: string | null
}

type Profile = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  role: string
}

function StatusPanel({ application }: { application: ApplicationStatus | null }) {
  if (!application) {
    return null
  }

  const submittedAt = application.submitted_at ? new Date(application.submitted_at).toLocaleString() : null
  const reviewedAt = application.reviewed_at ? new Date(application.reviewed_at).toLocaleString() : null

  if (application.status === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Your organizer application is pending admin review.
        {submittedAt ? ` Submitted ${submittedAt}.` : ''}
      </div>
    )
  }

  if (application.status === 'approved') {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        Your organizer application was approved. Sign in again to open the organizer workspace.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      Your last organizer application was rejected.
      {reviewedAt ? ` Reviewed ${reviewedAt}.` : ''} You can submit a new application below.
    </div>
  )
}

export default function VoterDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [application, setApplication] = useState<ApplicationStatus | null>(null)

  useEffect(() => {
    const loadDashboard = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        router.replace('/auth/sign-in')
        return
      }

      const [{ data: profileData, error: profileError }, { data: appData }] = await Promise.all([
        supabase.from('users').select('id, email, first_name, last_name, role').eq('id', user.id).maybeSingle(),
        supabase
          .from('organizer_applications')
          .select('id, status, submitted_at, reviewed_at')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (profileError || !profileData) {
        router.replace('/auth/sign-in')
        return
      }

      if (profileData.role === 'admin') {
        window.location.href = '/admin'
        return
      }

      if (profileData.role === 'organizer') {
        window.location.href = '/organizer'
        return
      }

      setProfile(profileData)
      setApplication(appData ?? null)
      setLoading(false)
    }

    loadDashboard()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold" />
      </div>
    )
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || 'Voter'
  const canShowApplicationForm = !application || application.status === 'rejected'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.08)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-gold">Voter Account</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome, {displayName}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Use this account to browse live events, cast votes, and manage your organizer application after admin approval.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/events">Browse Events</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/vote">Vote With Event Code</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <Card className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold">
            <Vote className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Vote in Events</h2>
          <p className="mt-2 text-sm text-muted-foreground">Open published events, review candidates, and complete your votes through web or USSD.</p>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Organizer Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Applying here does not change your role immediately. Admin approval is still required before organizer access is granted.</p>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold">
            <WalletCards className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Account Scope</h2>
          <p className="mt-2 text-sm text-muted-foreground">This dashboard keeps voting and application activity separate from organizer wallets, withdrawals, and event management.</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Become an Organizer</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Submit your organizer application from your voter account. Approval happens only after admin review.
              </p>
            </div>
          </div>

          <StatusPanel application={application} />

          {canShowApplicationForm ? (
            <div className="mt-6">
              <OrganizerApplicationForm successHref="/voter" />
            </div>
          ) : null}
        </Card>

        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Quick Access</h2>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground">
            <p>Use the public event pages to vote and follow live contests.</p>
            <p>USSD payments continue to use your phone number as the payment identity.</p>
            <p>Organizer tools only appear after your role changes from voter to organizer.</p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Button asChild variant="secondary">
              <Link href="/events">Open Public Events</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/contact">Contact Support</Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  )
}