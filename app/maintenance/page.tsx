import Link from 'next/link'

export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-8 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.28),transparent_68%)] blur-3xl" />
      </div>

      <section className="relative w-full max-w-xl rounded-3xl border border-border bg-card/95 p-8 text-center shadow-[0_24px_60px_hsl(var(--foreground)/0.12)] backdrop-blur sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold">Maintenance Mode</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">We are improving BlakVote</h1>
        <p className="mt-4 text-sm text-muted-foreground sm:text-base">
          The platform is temporarily unavailable while we deploy updates. Please check back shortly.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-secondary px-5 text-sm font-semibold text-secondary-foreground transition hover:bg-muted"
          >
            Retry
          </Link>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-deep px-5 text-sm font-semibold text-gold-foreground transition hover:brightness-105"
          >
            Admin Sign In
          </Link>
        </div>
      </section>
    </main>
  )
}
