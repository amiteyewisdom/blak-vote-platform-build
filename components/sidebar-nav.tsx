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
}

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-2">

      {/* Brand */}
      <div className="mb-8 px-3">
        <h2 className="text-2xl font-bold tracking-wide bg-gradient-to-r from-[#F5C044] to-[#D9A92E] bg-clip-text text-transparent">
          BlakVote
        </h2>
        <p className="text-xs text-white/40 mt-1 tracking-wider">
          ORGANIZER PANEL
        </p>
      </div>

      {items.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              relative flex items-center gap-3 px-4 py-3 rounded-xl
              transition-all duration-300 group
              ${
                isActive
                  ? 'bg-[#141827] border border-[#F5C044]/30 shadow-[0_0_20px_rgba(245,192,68,0.15)]'
                  : 'hover:bg-white/5'
              }
            `}
          >
            {/* Active gold bar */}
            {isActive && (
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-[#F5C044] to-[#D9A92E]" />
            )}

            <Icon
              className={`w-5 h-5 transition-all duration-300 ${
                isActive
                  ? 'text-[#F5C044]'
                  : 'text-white/50 group-hover:text-white'
              }`}
            />

            <span
              className={`text-sm tracking-wide transition-all duration-300 ${
                isActive
                  ? 'text-white font-semibold'
                  : 'text-white/60 group-hover:text-white'
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
