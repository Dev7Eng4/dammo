import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { HealthScore } from '../../types/youtubeChannel'

const config: Record<HealthScore, { labelKey: string; bars: number; color: string }> = {
  high: { labelKey: 'health.high', bars: 3, color: 'bg-success' },
  medium: { labelKey: 'health.medium', bars: 2, color: 'bg-warning' },
  low: { labelKey: 'health.low', bars: 1, color: 'bg-danger' },
}

interface HealthIndicatorProps {
  score: HealthScore
  className?: string
}

export function HealthIndicator({ score, className }: HealthIndicatorProps) {
  const { t } = useTranslation('youtube')
  const c = config[score]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex items-end gap-0.5 h-3.5">
        {[1, 2, 3].map(bar => (
          <span
            key={bar}
            className={cn(
              'w-1 rounded-sm',
              bar === 1 ? 'h-1.5' : bar === 2 ? 'h-2.5' : 'h-3.5',
              bar <= c.bars ? c.color : 'bg-neutral-700',
            )}
          />
        ))}
      </span>
      <span className="text-xs text-neutral-400">{t(c.labelKey)}</span>
    </span>
  )
}
