import { Clapperboard, Globe, Radio, Rss, TrendingDown, TrendingUp } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { OverviewStats, OverviewTrends } from '../../types/dashboard'
import { Sparkline } from '../ui/Sparkline'

interface StatCardsProps {
  data: OverviewStats
  trends?: OverviewTrends
  loading?: boolean
}

const stats = [
  { key: 'youtubeChannels' as const, labelKey: 'stats.youtubeChannels', icon: Clapperboard, color: 'var(--color-danger)' },
  { key: 'tiktokAccounts' as const, labelKey: 'stats.tiktokAccounts', icon: Radio, color: 'var(--color-info)' },
  { key: 'facebookAssets' as const, labelKey: 'stats.facebookAssets', icon: Globe, color: '#a78bfa' },
  { key: 'sourceChannels' as const, labelKey: 'stats.sourceChannels', icon: Rss, color: 'var(--color-primary-500)' },
]

function deltaPercent(series?: number[]) {
  if (!series || series.length < 2) return null
  const first = series[0]
  const last = series[series.length - 1]
  if (first === 0) return last === 0 ? 0 : null
  return ((last - first) / first) * 100
}

export function StatCards({ data, trends, loading }: StatCardsProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        const series = trends?.[stat.key]
        const delta = deltaPercent(series)
        const up = delta !== null && delta >= 0

        return (
          <div
            key={stat.key}
            className="kpi-card px-4 py-3.5"
            style={{ '--kpi': stat.color } as CSSProperties}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className="size-4" style={{ color: stat.color }} />
                <span className="section-label">{t(stat.labelKey)}</span>
              </div>
              {!loading && delta !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                    up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  )}
                >
                  {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p
                className={cn(
                  'text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground',
                  loading && 'animate-pulse text-muted-foreground',
                )}
              >
                {loading ? '—' : data[stat.key].toLocaleString()}
              </p>
              {!loading && series && (
                <Sparkline values={series} className="shrink-0" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
