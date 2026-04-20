import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-gold to-gold-deep text-gold-foreground shadow-sm hover:brightness-110 hover:shadow-[0_4px_20px_hsl(var(--gold)/0.28)]',
        premium:
          'bg-gradient-to-br from-gold to-gold-deep text-gold-foreground shadow-lg hover:brightness-110 hover:shadow-[0_6px_28px_hsl(var(--gold)/0.35)]',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:border-gold/40 hover:bg-secondary/80',
        outline:
          'border border-border bg-transparent text-foreground hover:border-gold/50 hover:text-gold',
        destructive:
          'bg-gradient-to-r from-destructive to-destructive/85 text-destructive-foreground hover:brightness-110 hover:shadow-[0_4px_16px_hsl(var(--destructive)/0.3)]',
        ghost:
          'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        link:
          'text-gold underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 py-2.5',
        sm: 'h-9 rounded-xl px-4 py-2 text-sm',
        lg: 'h-14 rounded-xl px-10 py-3.5 text-lg',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
