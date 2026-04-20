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
    <nav className="flex flex-col gap-2">
      <p className="mb-5 px-4 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
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
              `relative group flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ` +
              (isActive
                ? 'border border-gold/30 bg-surface-card shadow-[0_0_20px_hsl(var(--gold)/0.15)]'
                : 'hover:bg-muted/60')
            }
          >
            {isActive && (
              <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-gradient-to-b from-gold to-gold-deep" />
            )}

            <Icon
              className={`h-5 w-5 transition-all duration-300 ${
                isActive
                  ? 'text-gold'
                  : 'text-muted-foreground group-hover:text-foreground'
              }`}
            />

            <span
              className={`text-sm tracking-wide transition-all duration-300 ${
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
