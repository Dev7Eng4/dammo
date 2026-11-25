import { ExternalLink } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchManualProjects } from '../../api/manualVideo'
import { fetchYoutubeChannelPendingVideos } from '../../api/youtubeChannels'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'
import type { YoutubeChannelVideo } from '../../types/youtubeChannel'
import { SearchInput } from '../ui'
import { youtubeIdOf } from './sourceUrls'

function formatDuration(sec?: number): string {
  if (!sec) return ''
  const minutes = Math.floor(sec / 60)
  return `${minutes}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

interface PendingSourcePickerProps {
  channelId: string
  /** Project being edited; its own sources do not count as "used elsewhere". Unset for a new project. */
  runId?: string
  /** Video ids currently in the source box; the matching row shows as picked. */
  selectedIds: string[]
  disabled: boolean
  /** One video at a time: the caller replaces the source box with this video's link. */
  onPick: (video: YoutubeChannelVideo) => void
}

/**
 * The channel's source-channel videos not processed yet: not prepared for the channel and not
 * used as a source by another project of the same channel.
 */
export function PendingSourcePicker({ channelId, runId, selectedIds, disabled, onPick }: PendingSourcePickerProps) {
  const { t, i18n } = useTranslation('manual')
  const group = useId()
  const [videos, setVideos] = useState<YoutubeChannelVideo[] | null>(null)
  const [query, setQuery] = useState('')

  useAbortableEffect(
    async (signal) => {
      setVideos(null)
      const [pending, projects] = await Promise.all([
        fetchYoutubeChannelPendingVideos(channelId, { signal }),
        fetchManualProjects({ signal }),
      ])
      const usedElsewhere = new Set(
        projects.items
          .filter((project) => project.id !== runId && project.input.channelId === channelId)
          .flatMap((project) => project.input.sourceUrls.map(youtubeIdOf))
          .filter((id): id is string => Boolean(id)),
      )
      // Preparing sources already have a skill script and open in the production list instead.
      setVideos(pending.items.filter((video) => video.status !== 'Preparing' && !usedElsewhere.has(video.id)))
    },
    [channelId, runId],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = videos ?? []
    return needle
      ? list.filter((video) => (video.title ?? '').toLowerCase().includes(needle) || video.id.includes(needle))
      : list
  }, [videos, query])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label">
          {t('sourcePicker.title')} {videos ? `(${videos.length})` : ''}
        </span>
        <SearchInput
          className="w-full sm:w-64"
          value={query}
          placeholder={t('sourcePicker.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('sourcePicker.hint')}</p>

      {videos === null ? (
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      ) : videos.length === 0 ? (
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">{t('sourcePicker.empty')}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-lg border border-border">
          {visible.map((video) => {
            const picked = selectedIds.includes(video.id)
            return (
              <li key={video.id}>
                <label
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-xs',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-elevated',
                    picked && 'bg-primary-500/10',
                  )}
                >
                  <input
                    type="radio"
                    name={group}
                    checked={picked}
                    disabled={disabled}
                    onChange={() => onPick(video)}
                    className="size-3.5 shrink-0 border-border bg-surface accent-primary-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span lang="ja" className="line-clamp-2 text-foreground">
                      {video.title}
                    </span>
                    <span className="text-muted-foreground">
                      {[
                        // Catalog entries scraped without stats come back with null counts.
                        typeof video.viewCount === 'number'
                          ? t('sourcePicker.views', { count: video.viewCount, formatted: video.viewCount.toLocaleString(i18n.language) })
                          : '',
                        formatDuration(video.duration),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('sourcePicker.open')}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </label>
              </li>
            )
          })}
          {visible.length === 0 ? <li className="p-3 text-xs text-muted-foreground">{t('sourcePicker.noMatch')}</li> : null}
        </ul>
      )}
    </div>
  )
}
