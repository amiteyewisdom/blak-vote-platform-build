'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import BrandLogo from '@/components/BrandLogo'
import { User, LogOut, Settings, Menu, X } from 'lucide-react'

export interface HeaderProps {
  user?: {
    email: string
    firstName?: string
    lastName?: string
  }
  onToggleSidebar?: () => void
  sidebarOpen?: boolean
  homeHref?: string
  settingsHref?: string
  settingsLabel?: string
}

export function Header({
  user,
  onToggleSidebar,
  sidebarOpen,
  homeHref,
  settingsHref,
  settingsLabel = 'Settings',
}: HeaderProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.email
  const resolvedHomeHref =
    homeHref || (pathname.startsWith('/admin') ? '/admin' : pathname.startsWith('/voter') ? '/voter' : '/organizer')
  const resolvedSettingsHref =
    settingsHref || (pathname.startsWith('/admin') ? '/admin' : pathname.startsWith('/voter') ? '/voter' : '/organizer/settings')

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 md:h-20 md:gap-4 md:px-10">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary text-foreground transition hover:bg-muted md:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href={resolvedHomeHref} aria-label="Go to dashboard home" className="group flex min-w-0 items-center gap-2 sm:gap-3 md:gap-4">
            <BrandLogo
              size="sm"
              className="transition-all duration-300 group-hover:scale-[1.02]"
              textClassName="hidden text-lg sm:inline sm:text-xl md:text-2xl"
            />
          </Link>
        </div>

        {mounted && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex max-w-[44vw] items-center gap-1.5 rounded-xl border border-border bg-secondary px-2.5 py-2 transition-all duration-300 hover:border-gold/40 sm:max-w-[52vw] sm:gap-2 sm:px-3 md:max-w-none md:gap-3 md:px-4">
                <User className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium tracking-wide text-foreground/85 sm:hidden">
                  Account
                </span>
                <span className="hidden truncate text-sm font-medium tracking-wide text-foreground/85 sm:block">
                  {displayName}
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl"
            >
              <DropdownMenuItem asChild>
                <Link
                  href={resolvedSettingsHref}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-muted"
                >
                  <Settings className="h-4 w-4 text-gold" />
                  {settingsLabel}
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer gap-3 rounded-lg px-3 py-2 text-destructive transition-all hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
