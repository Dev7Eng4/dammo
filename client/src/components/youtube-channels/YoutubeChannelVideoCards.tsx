import { Eye, Heart, MessageCircle } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { API_V1 } from '../../api/config'
import { cn } from '../../lib/cn'
import type { YoutubeChannelVideo, YoutubeChannelVideoStatus } from '../../types/youtubeChannel'
import { isInteractiveTarget } from '../../utils/dom'
import { formatCompact } from '../../utils/ypp'

interface YoutubeChannelVideoCardsProps {
  channelId: string
  videos: YoutubeChannelVideo[]
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  selectedIds: Set<string>
  onToggleRow: (id: string) => void
  onCommentClick?: (video: YoutubeChannelVideo) => void
  onTitleClick?: (video: YoutubeChannelVideo) => void
}

const stampStyle: Record<YoutubeChannelVideoStatus, { labelKey: string; className: string }> = {
  Published: { labelKey: 'status.published', className: 'border-success/60 bg-black/55 text-success' },
  Uploaded: { labelKey: 'status.uploaded', className: 'border-secondary-300/60 bg-black/55 text-secondary-300' },
  Created: { labelKey: 'status.created', className: 'border-primary-400/60 bg-black/55 text-primary-300' },
  Prepared: { labelKey: 'status.prepared', className: 'border-primary-400/60 bg-black/55 text-primary-300' },
  Pending: { labelKey: 'status.pending', className: 'border-neutral-400/60 bg-black/55 text-neutral-200' },
  Error: { labelKey: 'status.error', className: 'border-danger/70 bg-black/55 text-danger' },
}

function hasLocalAssets(video: YoutubeChannelVideo): boolean {
  return video.status === 'Prepared' || video.status === 'Created' || video.localFolder === 'uploads'
}

function Thumbnail({ channelId, video }: { channelId: string; video: YoutubeChannelVideo }) {
  const sources = [
    hasLocalAssets(video)
      ? `${API_V1}/youtube-channels/${encodeURIComponent(channelId)}/videos/${encodeURIComponent(video.id)}/content/thumbnail`
      : null,
    `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`,
  ].filter((src): src is string => src !== null)

  const [attempt, setAttempt] = useState(0)
  const src = sources[attempt]

  if (!src) {
    return <div className="absolute inset-0 bg-gradient-to-br from-surface-elevated to-muted" aria-hidden="true" />
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setAttempt((current) => current + 1)}
      className="absolute inset-0 size-full scale-[1.02] object-cover"
    />
  )
}

export function YoutubeChannelVideoCards({
  channelId,
  videos,
  loading,
  error,
  emptyMessage,
  selectedIds,
  onToggleRow,
  onCommentClick,
  onTitleClick,
}: YoutubeChannelVideoCardsProps) {
  const { t } = useTranslation('youtube')

  if (loading) {
    return (
      <div className="card-grid" style={{ '--card-min': '190px' } as CSSProperties}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  if (error) return <p className="py-10 text-center text-sm text-danger">{error}</p>
  if (videos.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="card-grid" style={{ '--card-min': '190px' } as CSSProperties}>
      {videos.map((video) => {
        const selected = selectedIds.has(video.id)
        const stamp = video.status ? stampStyle[video.status] : null
        return (
          <div
            key={video.id}
            onClick={(event) => {
              if (!isInteractiveTarget(event.target)) onToggleRow(video.id)
            }}
            className={cn(
              'group cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary-500/50',
              selected && 'border-primary-500/60 ring-1 ring-primary-500',
            )}
          >
            <div className="relative aspect-video overflow-hidden bg-surface-elevated">
              <Thumbnail channelId={channelId} video={video} />
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleRow(video.id)}
                aria-label={video.title}
                className="absolute left-2 top-2 size-4 accent-primary-500"
              />
              {stamp ? (
                <span
                  className={cn(
                    'absolute right-2 top-2 -rotate-3 rounded-md border-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm',
                    stamp.className,
                  )}
                >
                  {t(stamp.labelKey)}
                </span>
              ) : null}
            </div>

            <div className="p-3">
              {onTitleClick ? (
                <button
                  type="button"
                  onClick={() => onTitleClick(video)}
                  className="line-clamp-2 min-h-10 w-full text-left text-sm font-medium text-foreground hover:text-primary-400"
                  title={video.title}
                >
                  {video.title}
                </button>
              ) : (
                <p className="line-clamp-2 min-h-10 text-sm font-medium text-foreground" title={video.title}>
                  {video.title}
                </p>
              )}

              <div className="mt-2 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3" />
                  {video.viewCount != null ? formatCompact(video.viewCount) : '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="size-3" />
                  {video.likeCount != null ? formatCompact(video.likeCount) : '—'}
                </span>
                {onCommentClick ? (
                  <button
                    type="button"
                    onClick={() => onCommentClick(video)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <MessageCircle className="size-3" />
                    {video.commentCount != null ? formatCompact(video.commentCount) : '—'}
                  </button>
                ) : null}
                {video.duration ? (
                  <span className="ml-auto">
                    {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
