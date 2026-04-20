'use client'

import PublicNav from '@/components/PublicNav'

const sections = [
  {
    title: 'Information We Collect',
    body: 'We collect account details, voting activity metadata, payment references, and support communications needed to operate the platform.',
  },
  {
    title: 'How We Use Information',
    body: 'Data is used to authenticate users, process votes and payments, prevent fraud, comply with legal obligations, and improve platform performance.',
  },
  {
    title: 'Data Sharing',
    body: 'We share limited information with trusted service providers (for example payment processors) only when needed to deliver services securely.',
  },
  {
    title: 'Security Practices',
    body: 'We implement layered technical and organizational safeguards, including access controls, monitoring, and secure infrastructure practices.',
  },
  {
    title: 'Data Retention',
    body: 'Records are retained for operational, legal, audit, and security purposes for a period appropriate to the service context and regulation.',
  },
  {
    title: 'Your Rights',
    body: 'Where applicable, you may request access, correction, deletion, or export of your personal data by contacting our privacy team.',
  },
  {
    title: 'Contact',
    body: 'For privacy requests, email blakvotebusiness@gmail.com or contact us via WhatsApp at https://wa.me/+233531652382.',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Legal</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Effective date: April 12, 2026. This policy explains how Black Events and BlakVote handle personal data across public and organizer experiences in Accra, Ghana.
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
