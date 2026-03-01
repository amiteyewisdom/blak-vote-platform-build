'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut, Settings } from 'lucide-react'

export interface HeaderProps {
  user?: {
    email: string
    firstName?: string
    lastName?: string
  }
}

export function Header({ user }: HeaderProps) {
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

  return (
    <header className="w-full border-b border-white/5 backdrop-blur-xl bg-[#0B0B0F]/70 sticky top-0 z-30">
      <div className="flex items-center justify-between px-10 h-20">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-4 group">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F5C044] to-[#D9A92E] flex items-center justify-center shadow-[0_0_30px_rgba(245,192,68,0.35)] transition-all duration-300 group-hover:scale-105">
            <span className="text-black font-bold text-lg">BV</span>
          </div>
          <span className="text-xl font-semibold tracking-wide text-white">
            BlakVote
          </span>
        </Link>

        {/* User Dropdown */}
        {mounted && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[#141827] border border-white/5 hover:border-[#F5C044]/40 transition-all duration-300">
                <User className="w-4 h-4 text-[#F5C044]" />
                <span className="text-sm text-white/80 font-medium tracking-wide">
                  {displayName}
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="bg-[#141827] border border-white/10 text-white rounded-xl p-2 shadow-2xl"
            >
              <DropdownMenuItem asChild>
                <Link
                  href="/organizer/settings"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
                >
                  <Settings className="w-4 h-4 text-[#F5C044]" />
                  Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 cursor-pointer transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
