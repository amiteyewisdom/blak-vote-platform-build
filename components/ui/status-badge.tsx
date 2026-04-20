import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const statusVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold shadow-sm',
  {
    variants: {
      variant: {
        draft: 'border-border bg-secondary text-secondary-foreground',
        pending: 'border-gold/30 bg-gradient-to-r from-gold to-gold-deep text-gold-foreground',
        closed: 'border-destructive/30 bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'draft',
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusVariants> {}

export function StatusBadge({ className, variant, ...props }: StatusBadgeProps) {
  return <div className={cn(statusVariants({ variant }), className)} {...props} />
}
