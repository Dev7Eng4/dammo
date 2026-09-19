import { Clapperboard, Globe, Radio, Rss } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { OverviewStats } from '../../types/dashboard'

interface StatCardsProps {
  data: OverviewStats
  loading?: boolean
}

const stats = [
  { key: 'youtubeChannels' as const, labelKey: 'stats.youtubeChannels', icon: Clapperboard },
  { key: 'tiktokAccounts' as const, labelKey: 'stats.tiktokAccounts', icon: Radio },
  { key: 'facebookAssets' as const, labelKey: 'stats.facebookAssets', icon: Globe },
  { key: 'sourceChannels' as const, labelKey: 'stats.sourceChannels', icon: Rss },
]

export function StatCards({ data, loading }: StatCardsProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div key={stat.key} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary-500/10 text-foreground">
                <Icon className="size-4" />
              </div>
              <span className="text-xs text-muted-foreground">{t(stat.labelKey)}</span>
            </div>
            <p
              className={cn(
                'mt-2 text-2xl font-semibold tracking-tight text-foreground',
                loading && 'animate-pulse text-muted-foreground',
              )}
            >
              {loading ? '—' : data[stat.key].toLocaleString()}
            </p>
          </div>
        )
      })}
    </div>
  )
}
