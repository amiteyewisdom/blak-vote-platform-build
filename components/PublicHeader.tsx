'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import BrandLogo from './BrandLogo'
import { PublicSidebar } from './PublicSidebar'

export function PublicHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-[hsl(var(--legacy-bg-base))]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-border/60 text-foreground hover:bg-foreground/[0.05] transition-colors"
                aria-label="Toggle menu"
              >
                {sidebarOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>

              <Link href="/" aria-label="Go to home" className="flex items-center font-semibold tracking-tight">
                <BrandLogo size="md" />
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/events" className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors">
                Ticketing
              </Link>
              <Link href="/contact" className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors">
                Contact
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <PublicSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  )
}
