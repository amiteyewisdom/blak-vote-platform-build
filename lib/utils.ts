import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatGHS(amount: unknown) {
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return 'GHS 0'
  }
  return `GHS ${Math.round(value).toLocaleString('en-US')}`
}
