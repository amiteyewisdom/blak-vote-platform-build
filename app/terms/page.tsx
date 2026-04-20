'use client'

import PublicNav from '@/components/PublicNav'

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: 'By using BlakVote, you agree to these terms and all applicable laws and regulations.',
  },
  {
    title: '2. Platform Use',
    body: 'You must use the platform lawfully and must not attempt to disrupt voting integrity, payment processing, or service availability.',
  },
  {
    title: '3. Account Responsibilities',
    body: 'Users are responsible for safeguarding credentials and for activities performed through their accounts.',
  },
  {
    title: '4. Payments and Refunds',
    body: 'Paid voting transactions are processed through approved payment providers. Refund handling is subject to organizer policy and applicable law.',
  },
  {
    title: '5. Data and Security',
    body: 'We apply technical and operational safeguards to protect personal data and election integrity, but no system can guarantee absolute security.',
  },
  {
    title: '6. Service Availability',
    body: 'We may perform maintenance, updates, or emergency interventions to improve reliability, security, and compliance.',
  },
  {
    title: '7. Contact',
    body: 'Questions regarding these terms can be sent to blakvotebusiness@gmail.com or via WhatsApp at https://wa.me/+233531652382.',
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Legal</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Terms and Conditions</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Effective date: April 12, 2026. Please review these terms before using Black Events and BlakVote services in Accra, Ghana.
          </p>
        </header>

        <section className="mt-8 space-y-4">
          {sections.map((section) => (
            <article key={section.title} className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-card-foreground">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{section.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
