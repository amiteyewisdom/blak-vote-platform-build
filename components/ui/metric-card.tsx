import * as React from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

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
    <div className={cn('glass rounded-2xl p-5 flex flex-col justify-between', className)}>
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-2xl font-semibold mt-2">{value}</div>
        </div>

        {Icon && (
          <div className="text-muted-foreground opacity-70">
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  )
}
