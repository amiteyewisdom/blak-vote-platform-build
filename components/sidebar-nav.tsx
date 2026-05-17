'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LucideIcon } from 'lucide-react'

export interface SidebarNavProps {
  items: Array<{
    label: string
    href: string
    icon: LucideIcon
  }>
  onNavigate?: () => void
}

export function SidebarNav({ items, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1.5">
      <p className="mb-3 px-3 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground sm:mb-5 sm:px-4 sm:text-xs">
        Navigation
      </p>

      {items.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={
              `relative group flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4 sm:py-3.5 ` +
              (isActive
                ? 'border border-gold/30 bg-surface-card shadow-[0_0_20px_hsl(var(--gold)/0.15)]'
                : 'hover:bg-muted/60')
            }
          >
            {isActive && (
              <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-gradient-to-b from-gold to-gold-deep" />
            )}

            <Icon
              className={`h-4 w-4 transition-all duration-300 sm:h-5 sm:w-5 ${
                isActive
                  ? 'text-gold'
                  : 'text-muted-foreground group-hover:text-foreground'
              }`}
            />

            <span
              className={`text-[13px] tracking-wide transition-all duration-300 sm:text-sm ${
                isActive
                  ? 'font-semibold text-foreground'
                  : 'text-foreground/70 group-hover:text-foreground'
              }`}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
