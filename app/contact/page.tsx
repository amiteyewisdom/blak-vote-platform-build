'use client'

import PublicNav from '@/components/PublicNav'

const contactOptions = [
  {
    title: 'General Support',
    label: 'blakvotebusiness@gmail.com',
    href: 'mailto:blakvotebusiness@gmail.com',
    description: 'Questions about voting, events, and account access.',
  },
  {
    title: 'WhatsApp Support',
    label: 'WhatsApp: +233 53 165 2382',
    href: 'https://wa.me/+233531652382',
    description: 'Fast assistance for event setup, voting access, and organizer questions.',
  },
  {
    title: 'Security & Compliance',
    label: 'blakvotebusiness@gmail.com',
    href: 'mailto:blakvotebusiness@gmail.com',
    description: 'Responsible disclosure, privacy requests, and compliance communication.',
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Contact</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">We are here to help</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Reach Blak Vote Business for support, event operations, or security-related requests. We typically respond within one business day.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contactOptions.map((option) => (
            <article key={option.title} className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold text-card-foreground">{option.title}</h2>
              <a
                href={option.href}
                target={option.href.startsWith('http') ? '_blank' : undefined}
                rel={option.href.startsWith('http') ? 'noreferrer' : undefined}
                className="mt-2 inline-block text-sm font-medium text-gold no-transition"
              >
                {option.label}
              </a>
              <p className="mt-3 text-sm text-muted-foreground">{option.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-card-foreground">Office Hours</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Black Events operates from Accra, Ghana. Monday to Friday, 8:00 AM to 6:00 PM (GMT). For urgent matters, use the WhatsApp or email channel above.
          </p>
        </section>
      </main>
    </div>
  )
}
