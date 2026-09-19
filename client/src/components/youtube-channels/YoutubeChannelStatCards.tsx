import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { YoutubeChannelStats } from '../../types/youtubeChannel'

interface YoutubeChannelStatCardsProps {
  data: YoutubeChannelStats | null
  loading?: boolean
}

export function YoutubeChannelStatCards({ data, loading }: YoutubeChannelStatCardsProps) {
  const { t } = useTranslation('youtube')

  const cards = [
    {
      key: 'total' as const,
      label: t('stats.total'),
      sub: (d: YoutubeChannelStats) => t('stats.totalSub', { count: d.addedThisWeek }),
    },
    {
      key: 'monetized' as const,
      label: t('stats.monetized'),
      sub: (d: YoutubeChannelStats) =>
        d.total > 0
          ? t('stats.monetizedSub', { percent: Math.round((d.monetized / d.total) * 100) })
          : '—',
    },
    {
      key: 'inReview' as const,
      label: t('stats.inReview'),
      sub: () => t('stats.inReviewSub'),
    },
    {
      key: 'limited' as const,
      label: t('stats.limited'),
      sub: () => t('stats.limitedSub'),
    },
    {
      key: 'stale' as const,
      label: t('stats.stale'),
      sub: () => t('stats.staleSub'),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map(card => {
        const value = data ? data[card.key] : 0
        return (
          <div key={card.key} className="card-surface px-4 py-3">
            <span className="text-xs text-neutral-500">{card.label}</span>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold text-neutral-50',
                loading && 'animate-pulse text-neutral-700',
              )}
            >
              {loading ? '—' : value.toLocaleString()}
            </p>
            {!loading && data ? (
              <p className="mt-0.5 text-[11px] text-neutral-500">{card.sub(data)}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
