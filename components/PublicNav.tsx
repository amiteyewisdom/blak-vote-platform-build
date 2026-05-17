'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'

const NAV_ITEMS = [
  { label: 'Home', href: '/events' },
  { label: 'Ticketing', href: '/events' },
  { label: 'Contact', href: '/contact' },
  { label: 'Open App', href: 'https://app.blakvote.com', external: true },
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
]

type PublicNavProps = {
  actions?: ReactNode
  showMobileSignIn?: boolean
  mobileSignInHref?: string
}

export default function PublicNav({
  actions,
  showMobileSignIn = true,
  mobileSignInHref = '/auth/sign-in',
}: PublicNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const close = () => setIsOpen(false)

  const handleNavClick = () => {
    close()
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0F19]/95">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Go to home" className="flex items-center">
            <BrandLogo size="sm" />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {actions ? <div className="hidden sm:flex items-center">{actions}</div> : null}

            {showMobileSignIn ? (
              <Link
                href={mobileSignInHref}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 sm:hidden"
              >
                Sign In
              </Link>
            ) : null}

            <button
              onClick={() => setIsOpen((open) => !open)}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              className="group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/70 transition-colors hover:bg-muted/80 sm:h-10 sm:w-10 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
            >
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 top-0 block h-[2px] w-5 rounded bg-gold transition-transform duration-300 ${
                    isOpen ? 'translate-y-[7px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`absolute left-0 top-[7px] block h-[2px] w-5 rounded bg-gold transition-opacity duration-300 ${
                    isOpen ? 'opacity-0' : ''
                  }`}
                />
                <span
                  className={`absolute left-0 top-[14px] block h-[2px] w-5 rounded bg-gold transition-transform duration-300 ${
                    isOpen ? 'translate-y-[-7px] -rotate-45' : ''
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <nav
        aria-label="Site navigation"
        className={`fixed right-0 top-0 z-50 flex h-screen w-[min(84vw,300px)] flex-col overflow-y-auto border-l border-border bg-card/95 shadow-[-12px_0_36px_hsl(var(--foreground)/0.18)] backdrop-blur-xl transition-transform duration-300 dark:border-white/10 dark:bg-[#111827]/98 dark:shadow-[-12px_0_40px_rgba(0,0,0,0.45)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b border-border px-4 py-4 sm:px-5 sm:py-5 dark:border-white/10">
          <Link href="/" aria-label="Go to home" className="flex items-center" onClick={close}>
            <BrandLogo size="sm" />
          </Link>
        </div>

        <ul className="flex-1 space-y-1 px-2 py-3 sm:py-4">
          {NAV_ITEMS.map((item) => {
            const active = !item.external && pathname === item.href
            return (
              <li key={`${item.label}-${item.href}`}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noreferrer' : undefined}
                  className={`block rounded-md px-4 py-2.5 text-sm transition-colors sm:py-3 sm:text-[15px] ${
                    active
                      ? 'border-r-2 border-gold bg-gold/10 text-gold font-semibold'
                      : 'text-foreground/75 hover:bg-muted/80 hover:text-foreground dark:text-slate-200 dark:hover:bg-white/[0.05] dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        {actions ? (
          <div className="border-t border-border px-4 py-3 sm:hidden dark:border-white/10">
            <div className="flex flex-col gap-2.5">{actions}</div>
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 dark:border-white/10">
          <Link href="/" aria-label="Go to home" className="flex items-center" onClick={close}>
            <BrandLogo size="sm" showText={false} />
          </Link>
          <span className="text-xs text-muted-foreground">Copyright 2026 BlakVote</span>
        </div>
      </nav>
    </>
  )
}
