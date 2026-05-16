import Link from 'next/link'
import { ArrowRight, Mail, MessageCircle } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  SUPPORT_WHATSAPP_HREF,
  SUPPORT_WHATSAPP_LABEL,
} from '@/lib/support-contact'

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute left-[-9rem] top-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.18),transparent_65%)] blur-3xl" />
      <div className="absolute bottom-[-9rem] right-[-9rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,hsl(var(--gold)/0.14),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_hsl(var(--foreground)/0.12)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="lg" centered />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Account creation is managed by BlakVote</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New voter, organizer, and admin accounts are created manually by our team. Contact us and we will set up the right access for you.
          </p>
        </div>

        <div className="space-y-4">
          <a
            href={SUPPORT_EMAIL_HREF}
            className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4 transition hover:border-gold/40 hover:bg-background"
          >
            <Mail size={18} className="mt-0.5 shrink-0 text-gold" />
            <span>
              <span className="block text-sm font-medium text-foreground">Email support</span>
              <span className="block text-sm text-muted-foreground">{SUPPORT_EMAIL}</span>
            </span>
          </a>

          <a
            href={SUPPORT_WHATSAPP_HREF}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4 transition hover:border-gold/40 hover:bg-background"
          >
            <MessageCircle size={18} className="mt-0.5 shrink-0 text-gold" />
            <span>
              <span className="block text-sm font-medium text-foreground">WhatsApp support</span>
              <span className="block text-sm text-muted-foreground">{SUPPORT_WHATSAPP_LABEL}</span>
            </span>
          </a>

          <p className="rounded-2xl border border-gold/20 bg-gold/10 p-4 text-sm text-muted-foreground">
            Include your full name, organization or event name, and the type of account you need so the team can create it correctly.
          </p>

          <Button asChild className="mt-2 h-12 w-full">
            <Link href="/contact">
              Contact BlakVote <ArrowRight size={16} />
            </Link>
          </Button>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-gold transition hover:opacity-80">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
