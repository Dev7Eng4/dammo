import { Timer } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductionStats } from '../../types/dashboard'

interface ProductionStatsCardProps {
  data?: ProductionStats
  loading?: boolean
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  if (minutes < 60) return `${minutes.toFixed(1)}′`
  return `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}′`
}

export function ProductionStatsCard({ data, loading }: ProductionStatsCardProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="kpi-card p-4" style={{ '--kpi': '#a78bfa' } as CSSProperties}>
      <div className="mb-3 flex items-center gap-2">
        <Timer className="size-4" style={{ color: '#a78bfa' }} />
        <p className="section-label">{t('production.title')}</p>
      </div>

      {loading || !data ? (
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {data.avgMinutesPerVideo === null ? '—' : formatMinutes(data.avgMinutesPerVideo)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.avgMinutesPerVideo === null
              ? t('production.noSamples')
              : t('production.avgPerVideo', { count: data.sampleSize })}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            {([
              ['today', data.today],
              ['last7Days', data.last7Days],
            ] as const).map(([key, bucket]) => (
              <div key={key} className="rounded-lg bg-muted/50 px-2 py-2">
                <p className="section-label">{t(`production.${key}`)}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {bucket.videos} {t('production.videos')}
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {bucket.completed} {t('production.ok')}
                  {bucket.failed > 0 ? (
                    <span className="text-danger"> · {bucket.failed} {t('production.failed')}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
