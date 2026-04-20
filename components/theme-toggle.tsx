'use client'

import * as React from 'react'
import { Laptop, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  const currentTheme = theme ?? 'system'
  const activeTheme = resolvedTheme ?? 'light'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open theme settings"
          className={cn(
            'group inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            className,
          )}
        >
          {activeTheme === 'dark' ? (
            <Moon className="h-4 w-4 text-gold" aria-hidden="true" />
          ) : (
            <Sun className="h-4 w-4 text-gold" aria-hidden="true" />
          )}
          {currentTheme === 'system' ? 'System' : currentTheme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 rounded-xl border-border bg-popover p-3">
        <DropdownMenuLabel className="px-0 text-popover-foreground">Appearance</DropdownMenuLabel>
        <p className="text-xs text-muted-foreground">Saved in local storage and applied automatically on next visit.</p>
        <DropdownMenuSeparator className="my-3" />

        <DropdownMenuRadioGroup value={currentTheme} onValueChange={(value) => setTheme(value)}>
          <DropdownMenuRadioItem value="light" className="rounded-lg py-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="rounded-lg py-2">
            <Moon className="h-4 w-4 text-muted-foreground" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="rounded-lg py-2">
            <Laptop className="h-4 w-4 text-muted-foreground" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
