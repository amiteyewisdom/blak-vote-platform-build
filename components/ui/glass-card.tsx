import * as React from 'react'

import { cn } from '@/lib/utils'

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('glass rounded-2xl p-6 bg-card/60', className)}
      {...props}
    >
      {children}
    </div>
  )
})
GlassCard.displayName = 'GlassCard'

export { GlassCard }
