import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border bg-card text-foreground',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/15 text-warning-foreground',
        destructive: 'bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>

export function Badge({
  className,
  variant,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <div className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}

