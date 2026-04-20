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
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
]

type PublicNavProps = {
  actions?: ReactNode
}

export default function PublicNav({ actions }: PublicNavProps) {
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
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Go to home" className="flex items-center">
            <BrandLogo size="md" />
          </Link>

          <div className="flex items-center gap-3">
            {actions ? <div className="hidden sm:flex items-center">{actions}</div> : null}

            <button
              onClick={() => setIsOpen((open) => !open)}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              className="group inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card/70 hover:bg-muted/80 transition-colors dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
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
        className={`fixed right-0 top-0 z-50 flex h-screen w-[min(88vw,320px)] flex-col overflow-y-auto border-l border-border bg-card/95 shadow-[-12px_0_36px_hsl(var(--foreground)/0.18)] backdrop-blur-xl transition-transform duration-300 dark:border-white/10 dark:bg-[#111827]/98 dark:shadow-[-12px_0_40px_rgba(0,0,0,0.45)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b border-border px-5 py-5 dark:border-white/10">
          <Link href="/" aria-label="Go to home" className="flex items-center" onClick={close}>
            <BrandLogo size="sm" />
          </Link>
        </div>

        <ul className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <li key={`${item.label}-${item.href}`}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  className={`block rounded-md px-4 py-3 text-[15px] transition-colors ${
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
          <div className="border-t border-border px-5 py-4 sm:hidden dark:border-white/10">
            <div className="flex flex-col gap-3">{actions}</div>
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-t border-border px-5 py-4 dark:border-white/10">
          <Link href="/" aria-label="Go to home" className="flex items-center" onClick={close}>
            <BrandLogo size="sm" showText={false} />
          </Link>
          <span className="text-xs text-muted-foreground">Copyright 2026 BlakVote</span>
        </div>
      </nav>
    </>
  )
}
