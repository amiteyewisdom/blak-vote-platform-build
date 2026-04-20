import * as React from 'react'
import { cn } from '@/lib/utils'

export default function MetricCard({
  title,
  value,
  icon: Icon,
  className,
}: {
  title: string
  value: React.ReactNode
  icon?: any
  className?: string
}) {
  return (
    <div className={cn('glass flex flex-col gap-3 rounded-2xl p-5', className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold leading-none text-foreground">{value}</div>
    </div>
  )
}
