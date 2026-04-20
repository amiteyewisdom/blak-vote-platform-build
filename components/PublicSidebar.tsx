'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

interface PublicSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function PublicSidebar({ isOpen, onClose }: PublicSidebarProps) {
  const pathname = usePathname()

  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 bg-[hsl(var(--legacy-bg-base))] border-r border-border/60 transform transition-transform duration-300 ease-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="flex flex-col gap-2 p-4">
          <Link
            href="/events"
            className={`block px-4 py-3 rounded-md font-medium transition-colors ${
              pathname?.includes('/events')
                ? 'bg-foreground/10 text-foreground'
                : 'text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05]'
            }`}
          >
            Home
          </Link>

          <Link
            href="/events"
            className={`block px-4 py-3 rounded-md font-medium transition-colors ${
              pathname?.includes('/events')
                ? 'bg-foreground/10 text-foreground'
                : 'text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05]'
            }`}
          >
            Ticketing
          </Link>

          <Link
            href="/contact"
            className="block px-4 py-3 rounded-md font-medium text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            Contact
          </Link>

          <div className="my-4 border-t border-border/60" />

          <Link
            href="/terms"
            className="block px-4 py-3 rounded-md font-medium text-sm text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            Terms &amp; Conditions
          </Link>

          <Link
            href="/privacy"
            className="block px-4 py-3 rounded-md font-medium text-sm text-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            Privacy Policy
          </Link>
        </nav>
      </div>
    </>
  )
}
