import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const statusVariants = cva(
  'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold shadow-sm',
  {
    variants: {
      variant: {
        draft: 'bg-neutral-800 text-muted-foreground',
        published: 'bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--gold-2))] text-black',
        closed: 'bg-destructive text-destructive-foreground',
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
