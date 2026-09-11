import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        success: 'border-success/30 bg-success/15 text-success',
        danger: 'border-danger/30 bg-danger/15 text-danger',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        info: 'border-info/30 bg-info/15 text-info',
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary-500/30 bg-primary-500/15 text-foreground',
      },
      withDot: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      withDot: false,
    },
  },
)

const dotTone: Record<NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-neutral-500',
  primary: 'bg-primary-500',
}

export type StatusTone = NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>

export interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  label: string
  className?: string
}

export function StatusBadge({ label, tone = 'neutral', withDot = false, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ tone, withDot }), className)}>
      {withDot ? <span className={cn('size-1.5 rounded-full', dotTone[tone ?? 'neutral'])} /> : null}
      {label}
    </span>
  )
}

export { statusBadgeVariants }
