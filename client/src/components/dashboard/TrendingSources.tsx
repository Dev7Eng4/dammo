import { ExternalLink, Flame } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TrendingSourceVideo } from '../../types/dashboard'

interface TrendingSourcesProps {
  items?: TrendingSourceVideo[]
  loading?: boolean
}

function formatViews(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export function TrendingSources({ items, loading }: TrendingSourcesProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="kpi-card p-4" style={{ '--kpi': 'var(--color-tertiary-400)' } as CSSProperties}>
      <div className="mb-1 flex items-center gap-2">
        <Flame className="size-4" style={{ color: 'var(--color-tertiary-400)' }} />
        <p className="section-label">{t('trending.title')}</p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{t('trending.hint')}</p>

      {loading || !items ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('trending.empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={`${item.sourceId}-${item.videoId}`} className="flex items-center gap-3 py-2">
              <span
                className="w-14 shrink-0 rounded-md bg-tertiary-500/15 px-1.5 py-1 text-center text-xs font-bold tabular-nums"
                style={{ color: 'var(--color-tertiary-400)' }}
                title={t('trending.ratioTitle')}
              >
                ×{item.ratio >= 10 ? Math.round(item.ratio) : item.ratio.toFixed(1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground" title={item.title}>
                  {item.title}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  <Link to={`/source-channels/${item.sourceId}`} className="hover:text-foreground hover:underline">
                    {item.sourceName}
                  </Link>
                  {' · '}
                  {formatViews(item.viewCount)} {t('trending.views')}
                  {item.used ? ` · ${t('trending.used')}` : ''}
                </p>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                aria-label={t('trending.open')}
                title={t('trending.open')}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
