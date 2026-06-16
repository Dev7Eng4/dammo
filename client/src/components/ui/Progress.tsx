import { cn } from '../../lib/cn'

const toneStyles = {
  primary: 'bg-primary-400',
  secondary: 'bg-secondary-400',
  tertiary: 'bg-tertiary-400',
  neutral: 'bg-neutral-400',
} as const

export type ProgressTone = keyof typeof toneStyles

export interface ProgressProps {
  value: number
  max?: number
  tone?: ProgressTone
  className?: string
  label?: string
}

export function Progress({
  value,
  max = 100,
  tone = 'primary',
  className,
  label,
}: ProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={cn('w-full', className)}>
      {label ? <p className="text-label mb-2">{label}</p> : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300', toneStyles[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
