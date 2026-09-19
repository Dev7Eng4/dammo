import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { MonetizationStatus } from '../../types/youtubeChannel'

const config: Record<MonetizationStatus, { labelKey: string; dot: string; text: string; bg: string }> = {
  monetized: {
    labelKey: 'monetization.monetized',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  in_review: {
    labelKey: 'monetization.inReview',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  demonetized: {
    labelKey: 'monetization.demonetized',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
  limited: {
    labelKey: 'monetization.limited',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
}

interface MonetizationPillProps {
  status: MonetizationStatus
  className?: string
}

export function MonetizationPill({ status, className }: MonetizationPillProps) {
  const { t } = useTranslation('youtube')
  const c = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {t(c.labelKey)}
    </span>
  )
}
