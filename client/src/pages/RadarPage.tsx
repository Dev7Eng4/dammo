import { ExternalLink, Radar as RadarIcon, RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { fetchRadar, fetchRadarStatus, scanRadar } from '../api/radar'
import { PageHeader, PageShell } from '../components/layout'
import { Button, Progress, Select, StatusBadge, useToast, type StatusTone } from '../components/ui'
import { useAbortableEffect } from '../hooks'
import type { RadarFilters, RadarItem, RadarListResponse, RadarStatus, RadarTier } from '../types/radar'

const DEFAULT_FILTERS: RadarFilters = { maxAgeHours: 168, minRatio: 3 }
const MAX_AGE_OPTIONS = [24, 72, 168, 720] as const
const MIN_RATIO_OPTIONS = ['3', '8', '20'] as const

const TIER_TONE: Record<RadarTier, StatusTone> = {
  spike: 'info',
  burst: 'warning',
  super: 'danger',
}

function formatViews(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.round(value))
}

function formatRatio(ratio: number): string {
  return `×${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}`
}

export function RadarPage() {
  const { t, i18n } = useTranslation('radar')
  const { toast } = useToast()
  const [filters, setFilters] = useState<RadarFilters>(DEFAULT_FILTERS)
  const [status, setStatus] = useState<RadarStatus | null>(null)
  const [list, setList] = useState<RadarListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useAbortableEffect(
    async (signal) => {
      setLoading(true)
      setError(null)
      try {
        const [nextStatus, nextList] = await Promise.all([
          fetchRadarStatus({ signal }),
          fetchRadar(filters, { signal }),
        ])
        setStatus(nextStatus)
        setList(nextList)
      } catch (err) {
        if (signal.aborted) return
        setError(err instanceof Error ? err.message : t('page.loadError'))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [filters, reloadKey],
  )

  const handleScan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await scanRadar()
      if (result.stoppedForQuota) {
        toast.error(t('scan.quotaStop', { skipped: result.skippedChannels }))
      } else if (result.failedChannels.length > 0) {
        toast.error(
          t('scan.partial', { count: result.scannedChannels, failed: result.failedChannels.length }),
        )
      } else {
        toast.success(
          t('scan.done', { count: result.scannedChannels, units: result.quotaUsedThisScan }),
        )
      }
      setReloadKey((key) => key + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('scan.failed'))
    } finally {
      setScanning(false)
    }
  }, [t, toast])

  const ageOptions = MAX_AGE_OPTIONS.map((hours) => ({
    value: String(hours),
    label: t(`filters.age${hours}`),
  }))
  const ratioOptions = MIN_RATIO_OPTIONS.map((ratio) => ({ value: ratio, label: `≥ ×${ratio}` }))

  const quotaPercent = status && status.quotaCap > 0 ? (status.quotaUsedToday / status.quotaCap) * 100 : 0
  const lastScan = status?.lastScanAt
    ? new Date(status.lastScanAt).toLocaleString(i18n.language)
    : t('status.never')

  function formatAge(hours: number): string {
    return hours < 48
      ? t('unit.hours', { value: Math.round(hours) })
      : t('unit.days', { value: Math.round(hours / 24) })
  }

  function emptyMessage(): string {
    if (status && !status.apiKeyConfigured) return t('empty.noKey')
    if (status && status.trackedChannels === 0) return t('empty.noChannels')
    if (status && status.trackedVideos === 0) return t('empty.noScan')
    if (status && status.channelsWithBaseline === 0) return t('empty.noBaseline')
    return t('empty.noResult')
  }

  const items: RadarItem[] = list?.items ?? []

  return (
    <PageShell>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon={RadarIcon}
        actions={
          <Button
            size="sm"
            onClick={() => void handleScan()}
            disabled={scanning || (status !== null && !status.apiKeyConfigured)}
          >
            <RefreshCw className={scanning ? 'size-4 animate-spin' : 'size-4'} />
            {scanning ? t('page.scanning') : t('page.scan')}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card-surface p-4 md:col-span-2">
          <p className="section-label">{t('status.quota')}</p>
          <p className="mt-1 text-sm tabular-nums text-foreground">
            {t('status.quotaValue', { used: status?.quotaUsedToday ?? 0, cap: status?.quotaCap ?? 0 })}
          </p>
          <Progress
            className="mt-2"
            value={quotaPercent}
            tone={quotaPercent >= 90 ? 'tertiary' : 'primary'}
          />
        </div>
        <div className="card-surface p-4">
          <p className="section-label">{t('status.channels')}</p>
          <p className="mt-1 text-sm text-foreground">
            {t('status.channelsValue', {
              ready: status?.channelsWithBaseline ?? 0,
              total: status?.trackedChannels ?? 0,
            })}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('status.videos')}: {status?.trackedVideos ?? 0}
          </p>
        </div>
        <div className="card-surface p-4">
          <p className="section-label">{t('status.lastScan')}</p>
          <p className="mt-1 text-sm text-foreground">{lastScan}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('filters.age')}
          <Select
            className="w-36"
            options={ageOptions}
            value={String(filters.maxAgeHours)}
            onChange={(value) => setFilters((prev) => ({ ...prev, maxAgeHours: Number(value) }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('filters.ratio')}
          <Select
            className="w-28"
            options={ratioOptions}
            value={String(filters.minRatio)}
            onChange={(value) => setFilters((prev) => ({ ...prev, minRatio: Number(value) }))}
          />
        </label>
      </div>

      {error ? (
        <div className="card-surface p-6 text-center">
          <p className="text-danger">{error}</p>
          <button
            type="button"
            className="mt-3 text-sm text-secondary-400 hover:text-secondary-300"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t('page.retry')}
          </button>
        </div>
      ) : loading && !list ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">{emptyMessage()}</div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">{t('table.ratio')}</th>
                <th className="px-4 py-3">{t('table.video')}</th>
                <th className="px-4 py-3">{t('table.channel')}</th>
                <th className="px-4 py-3 text-right">{t('table.age')}</th>
                <th className="px-4 py-3 text-right">{t('table.views')}</th>
                <th className="px-4 py-3 text-right">{t('table.perHour')}</th>
                <th className="px-4 py-3 text-right">{t('table.expected')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.videoId} className={loading ? 'opacity-60' : undefined}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-base font-bold tabular-nums text-foreground">
                        {formatRatio(item.ratio)}
                      </span>
                      <StatusBadge tone={TIER_TONE[item.tier]} label={t(`tier.${item.tier}`)} />
                    </div>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <p className="line-clamp-2 text-foreground" title={item.title}>
                      {item.title}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/source-channels/${item.sourceId}`}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {item.sourceName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatAge(item.ageHours)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatViews(item.viewCount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatViews(item.viewsPerHour)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatViews(item.expectedViews)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('table.open')}
                      title={t('table.open')}
                      className="inline-flex rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
