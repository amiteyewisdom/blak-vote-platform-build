import * as React from 'react'
import { cn } from '@/lib/utils'

import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input, type InputProps } from '@/components/ui/input'

export function DSPrimaryButton(props: ButtonProps) {
  return <Button variant="default" {...props} />
}

export function DSSecondaryButton(props: ButtonProps) {
  return <Button variant="secondary" {...props} />
}

export const DSCard = Card
export const DSCardHeader = CardHeader
export const DSCardTitle = CardTitle
export const DSCardDescription = CardDescription
export const DSCardContent = CardContent
export const DSCardFooter = CardFooter

export const DSInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => <Input ref={ref} {...props} />,
)

DSInput.displayName = 'DSInput'

export type DSSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>
export const DSSelect = React.forwardRef<HTMLSelectElement, DSSelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
)

DSSelect.displayName = 'DSSelect'

export type DSTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>
export const DSTextarea = React.forwardRef<HTMLTextAreaElement, DSTextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
)

DSTextarea.displayName = 'DSTextarea'