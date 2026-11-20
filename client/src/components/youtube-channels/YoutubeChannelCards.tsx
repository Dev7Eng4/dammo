import { ArrowUpRight, CalendarClock, Pencil, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import { refreshYoutubeChannelStats, updateYoutubeChannelStats } from '../../api/youtubeChannels'
import { useToast } from '../ui'
import { isInteractiveTarget } from '../../utils/dom'
import {
  formatCompact,
  formatNumber,
  levelColor,
  levelFor,
  LEVEL_THRESHOLDS,
  YPP_HOURS,
  YPP_SUBSCRIBERS,
} from '../../utils/ypp'
import { MonetizationPill } from './MonetizationPill'

function StatBlock({
  label,
  value,
  target,
  color,
  empty,
}: {
  label: string
  value: number
  target: number
  color: string
  empty?: boolean
}) {
  const percent = empty ? 0 : Math.min(100, (value / target) * 100)
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate tabular-nums">
        <span className={cn('text-base font-semibold', empty ? 'text-muted-foreground' : 'text-foreground')}>
          {empty ? '—' : formatCompact(value)}
        </span>
        <span className="text-[11px] text-muted-foreground"> / {formatCompact(target)}</span>
      </p>
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  )
}

function ChannelAvatar({ channel, color }: { channel: YoutubeChannel; color: string }) {
  const [broken, setBroken] = useState(false)
  const ring = { boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 55%, transparent)` }
  if (channel.avatarUrl && !broken) {
    return (
      <img
        src={channel.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
        className="size-11 shrink-0 rounded-full bg-muted object-cover"
        style={ring}
      />
    )
  }
  const initial = Array.from(channel.name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold"
      style={{ ...ring, color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {initial}
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
    'mt-1 w-full rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground outline-none focus:border-primary-500'

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('cards.watchHours')}
          </span>
          <input type="number" min={0} step="any" value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('cards.subscribers')}
          </span>
          <input type="number" min={0} step={1} value={subs} onChange={(e) => setSubs(e.target.value)} className={inputClass} />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('cards.hoursHint')}</p>
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
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN'

  if (loading) {
    return (
      <div className="card-grid" style={{ '--card-min': '240px' } as CSSProperties}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  if (channels.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('cards.empty')}</p>
  }

  return (
    <div className="card-grid" style={{ '--card-min': '240px' } as CSSProperties}>
      {channels.map((channel) => {
        const hasMetrics = channel.watchHours !== undefined || channel.subscribers !== undefined
        const hours = channel.watchHours ?? 0
        const subs = channel.subscribers ?? 0
        const level = levelFor(hours)
        const color = levelColor(level)
        const eligible = hours >= YPP_HOURS && subs >= YPP_SUBSCRIBERS
        const nextTarget = LEVEL_THRESHOLDS[level] // undefined at max level
        const selected = selectedIds.has(channel.id)
        const editing = editingId === channel.id
        const hint = eligible
          ? t('cards.ypp')
          : nextTarget !== undefined
            ? t('cards.hoursLeft', {
                next: level + 1,
                target: formatNumber(nextTarget),
                left: formatNumber(Math.max(0, nextTarget - hours)),
              })
            : ''

        return (
          <div
            key={channel.id}
            onClick={(event) => {
              if (!isInteractiveTarget(event.target)) onToggleRow(channel.id)
            }}
            className={cn(
              'group relative flex cursor-pointer flex-col rounded-xl border bg-surface transition-all duration-150',
              'hover:-translate-y-0.5 hover:border-neutral-500/60 hover:shadow-lg hover:shadow-black/20',
              selected ? 'border-primary-500 ring-1 ring-primary-500/60' : 'border-border',
            )}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleRow(channel.id)}
              aria-label={channel.name}
              className={cn(
                'absolute right-3 top-3 size-4 accent-primary-500 transition-opacity',
                selected ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
              )}
            />

            {/* Identity */}
            <div className="flex items-center gap-3 p-4 pb-3 pr-9">
              <ChannelAvatar channel={channel} color={color} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground" title={channel.name}>
                  {channel.name}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={channel.handle}>
                  {channel.handle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-4">
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  color,
                  borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                }}
              >
                <Sparkles className="size-3" />
                {t('cards.levelShort', { level })}
              </span>
              <MonetizationPill status={channel.monetizationStatus} />
            </div>

            {/* YPP progress */}
            <div className="flex-1 px-4 pb-3 pt-4">
              {editing ? (
                <StatsEditor channel={channel} onSaved={onChannelUpdated} onClose={() => setEditingId(null)} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <StatBlock
                      label={t('cards.watchHours')}
                      value={hours}
                      target={YPP_HOURS}
                      color={color}
                      empty={!hasMetrics}
                    />
                    <StatBlock
                      label={t('cards.subscribers')}
                      value={subs}
                      target={YPP_SUBSCRIBERS}
                      color="var(--color-danger)"
                      empty={!hasMetrics}
                    />
                  </div>
                  {hasMetrics ? (
                    <p className="mt-2.5 truncate text-[11px] text-muted-foreground" title={hint}>
                      {hint}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingId(channel.id)}
                      className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary-400 hover:text-primary-300"
                    >
                      <Plus className="size-3" />
                      {t('cards.addStats')}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <span
                className="inline-flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground"
                title={t('cards.lastUpload')}
              >
                <CalendarClock className="size-3.5 shrink-0" />
                {channel.lastUploadAt ? new Date(channel.lastUploadAt).toLocaleDateString(dateLocale) : t('cards.never')}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : channel.id)}
                  title={t('cards.editStats')}
                  aria-label={t('cards.editStats')}
                  className={cn(
                    'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    editing && 'bg-muted text-foreground',
                  )}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(channel.id)}
                  title={t('cards.open')}
                  aria-label={t('cards.open')}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
