import { Clapperboard, ExternalLink, Pencil, RefreshCw, Trophy } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import { refreshYoutubeChannelStats, updateYoutubeChannelStats } from '../../api/youtubeChannels'
import { useToast } from '../ui'
import { formatNumber, levelColor, levelFor, LEVEL_THRESHOLDS, YPP_HOURS, YPP_SUBSCRIBERS } from '../../utils/ypp'
import { MonetizationPill } from './MonetizationPill'

function MeterRow({
  label,
  value,
  target,
  color,
  hint,
}: {
  label: string
  value: number
  target: number
  color: string
  hint?: string
}) {
  const percent = Math.min(100, (value / target) * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="section-label">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {formatNumber(value)} / {formatNumber(target)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: `linear-gradient(to right, ${color}, color-mix(in srgb, ${color} 55%, white))` }}
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function StatsEditor({
  channel,
  onSaved,
  onClose,
}: {
  channel: YoutubeChannel
  onSaved: (channel: YoutubeChannel) => void
  onClose: () => void
}) {
  const { t } = useTranslation('youtube')
  const { toast } = useToast()
  const [hours, setHours] = useState(String(channel.watchHours ?? ''))
  const [subs, setSubs] = useState(String(channel.subscribers ?? ''))
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<{ item: YoutubeChannel }>) {
    setBusy(true)
    try {
      const { item } = await action()
      onSaved(item)
      toast.success(t('cards.saved'))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cards.saveError'))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const payload: { watchHours?: number; subscribers?: number } = {}
    if (hours.trim() !== '' && Number.isFinite(Number(hours))) payload.watchHours = Number(hours)
    if (subs.trim() !== '' && Number.isFinite(Number(subs))) payload.subscribers = Math.round(Number(subs))
    if (Object.keys(payload).length === 0) return onClose()
    void run(() => updateYoutubeChannelStats(channel.id, payload))
  }

  const inputClass =
    'w-full rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground outline-none focus:border-primary-500'

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-2.5">
      <label className="block">
        <span className="section-label">{t('cards.watchHours')}</span>
        <input type="number" min={0} step="any" value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} />
        <span className="text-[11px] text-muted-foreground">{t('cards.hoursHint')}</span>
      </label>
      <label className="block">
        <span className="section-label">{t('cards.subscribers')}</span>
        <input type="number" min={0} step={1} value={subs} onChange={(e) => setSubs(e.target.value)} className={inputClass} />
      </label>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => refreshYoutubeChannelStats(channel.id))}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3', busy && 'animate-spin')} />
          {t('cards.refreshSubs')}
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            {t('cards.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
          >
            {t('cards.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface YoutubeChannelCardsProps {
  channels: YoutubeChannel[]
  loading?: boolean
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onToggleRow: (id: string) => void
  onChannelUpdated: (channel: YoutubeChannel) => void
}

export function YoutubeChannelCards({
  channels,
  loading,
  selectedIds,
  onSelect,
  onToggleRow,
  onChannelUpdated,
}: YoutubeChannelCardsProps) {
  const { t, i18n } = useTranslation('youtube')
  const [editingId, setEditingId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  if (channels.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('cards.empty')}</p>
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {channels.map((channel) => {
        const hasMetrics = channel.watchHours !== undefined || channel.subscribers !== undefined
        const hours = channel.watchHours ?? 0
        const subs = channel.subscribers ?? 0
        const level = levelFor(hours)
        const color = levelColor(level)
        const eligible = hours >= YPP_HOURS && subs >= YPP_SUBSCRIBERS
        const nextTarget = LEVEL_THRESHOLDS[level] // undefined at max level
        const selected = selectedIds.has(channel.id)
        const lastUpload = channel.lastUploadAt
          ? new Date(channel.lastUploadAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN')
          : '—'

        return (
          <div
            key={channel.id}
            className={cn('kpi-card flex flex-col gap-3 p-4', selected && 'ring-1 ring-primary-500')}
            style={{ '--kpi': eligible ? 'var(--color-primary-500)' : color } as CSSProperties}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleRow(channel.id)}
                aria-label={channel.name}
                className="size-4 shrink-0 accent-primary-500"
              />
              <div
                className="relative flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-surface-elevated"
                style={{ borderColor: color }}
              >
                <Clapperboard className="size-5" style={{ color }} />
                <span
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[9px] font-bold leading-4 text-on-primary"
                  style={{ background: color }}
                >
                  {t('cards.level', { level })}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === channel.id ? null : channel.id)}
                  title={t('cards.editStats')}
                  aria-label={t('cards.editStats')}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(channel.id)}
                  title={t('cards.open')}
                  aria-label={t('cards.open')}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={channel.name}>
                {channel.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{channel.handle}</p>
            </div>

            <div className="space-y-2.5 pt-1">
              {editingId === channel.id ? (
                <StatsEditor
                  channel={channel}
                  onSaved={onChannelUpdated}
                  onClose={() => setEditingId(null)}
                />
              ) : hasMetrics ? (
                <>
                  <MeterRow
                    label={t('cards.watchHours')}
                    value={hours}
                    target={YPP_HOURS}
                    color={color}
                    hint={
                      eligible
                        ? t('cards.ypp')
                        : nextTarget !== undefined
                          ? t('cards.hoursLeft', {
                              next: level + 1,
                              target: formatNumber(nextTarget),
                              left: formatNumber(Math.max(0, nextTarget - hours)),
                            })
                          : undefined
                    }
                  />
                  <MeterRow
                    label={t('cards.subscribers')}
                    value={subs}
                    target={YPP_SUBSCRIBERS}
                    color="var(--color-danger)"
                  />
                </>
              ) : (
                <p className="rounded-lg bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
                  {t('cards.noData')}
                </p>
              )}
            </div>

            <div className="mt-auto flex flex-col items-start gap-1.5 border-t border-border pt-3">
              <MonetizationPill status={channel.monetizationStatus} />
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Trophy className="size-3" />
                {t('cards.lastUpload')}: {lastUpload}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
