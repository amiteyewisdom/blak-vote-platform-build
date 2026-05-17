'use client'

import PublicNav from '@/components/PublicNav'
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  SUPPORT_WHATSAPP_HREF,
  SUPPORT_WHATSAPP_LABEL,
} from '@/lib/support-contact'

const contactOptions = [
  {
    title: 'General Support',
    label: SUPPORT_EMAIL,
    href: SUPPORT_EMAIL_HREF,
    description: 'Questions about voting, events, and account access.',
  },
  {
    title: 'WhatsApp Support',
    label: SUPPORT_WHATSAPP_LABEL,
    href: SUPPORT_WHATSAPP_HREF,
    description: 'Fast assistance for event setup, voting access, and organizer questions.',
  },
  {
    title: 'Security & Compliance',
    label: SUPPORT_EMAIL,
    href: SUPPORT_EMAIL_HREF,
    description: 'Responsible disclosure, privacy requests, and compliance communication.',
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Contact</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">We are here to help</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Reach Blak Vote Business for support, event operations, security-related requests, or manual account creation. New voter, organizer, and admin accounts are provisioned by our team. We typically respond within one business day.
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contactOptions.map((option) => (
            <article key={option.title} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="text-base font-semibold text-card-foreground sm:text-lg">{option.title}</h2>
              <a
                href={option.href}
                target={option.href.startsWith('http') ? '_blank' : undefined}
                rel={option.href.startsWith('http') ? 'noreferrer' : undefined}
                className="mt-2 inline-block text-sm font-medium text-gold no-transition"
              >
                {option.label}
              </a>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{option.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:mt-8 sm:p-8">
          <h2 className="text-lg font-semibold text-card-foreground sm:text-xl">Office Hours</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Black Events operates from Accra, Ghana. Monday to Friday, 8:00 AM to 6:00 PM (GMT). For urgent matters, use the WhatsApp or email channel above.
          </p>
        </section>
      </main>
    </div>
  )
}
