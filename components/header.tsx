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
}

export function Header({ user, onToggleSidebar, sidebarOpen }: HeaderProps) {
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
  const homeHref = pathname.startsWith('/admin') ? '/admin' : '/organizer'

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:h-20 md:gap-4 md:px-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden rounded-2xl border border-border bg-secondary p-2 text-foreground transition hover:bg-muted"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href={homeHref} aria-label="Go to dashboard home" className="group flex items-center gap-3 md:gap-4">
            <BrandLogo size="md" className="transition-all duration-300 group-hover:scale-[1.02]" />
          </Link>
        </div>

        {mounted && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex max-w-[52vw] items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 transition-all duration-300 hover:border-gold/40 md:max-w-none md:gap-3 md:px-4">
                <User className="h-4 w-4 text-gold" />
                <span className="truncate text-sm font-medium tracking-wide text-foreground/85">
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
                  href="/organizer/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-muted"
                >
                  <Settings className="h-4 w-4 text-gold" />
                  Settings
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
