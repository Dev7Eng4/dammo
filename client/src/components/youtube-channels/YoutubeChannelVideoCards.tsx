import { CalendarDays, Check, Eye, Heart, MessageCircle } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { API_V1 } from '../../api/config'
import { cn } from '../../lib/cn'
import { formatPublishedDate } from '../../utils/youtubeVideo'
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
  /** Per-video cache-busting stamps, set when a video's local thumbnail was just replaced. */
  thumbnailVersions?: Record<string, number>
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

/** Prepared/Created videos are not on YouTube yet, so a YouTube thumbnail for their id does not exist. */
function isLocalOnly(video: YoutubeChannelVideo): boolean {
  return video.status === 'Prepared' || video.status === 'Created'
}

function Thumbnail({
  channelId,
  video,
  version,
}: {
  channelId: string
  video: YoutubeChannelVideo
  version?: number
}) {
  const localSource = hasLocalAssets(video)
    ? `${API_V1}/youtube-channels/${encodeURIComponent(channelId)}/videos/${encodeURIComponent(video.id)}/content/thumbnail${version ? `?v=${version}` : ''}`
    : null
  // Highest quality first; each step is used only if the previous one fails to load.
  // maxresdefault is 1280x720, hqdefault 480x360 (letterboxed, cropped by object-cover),
  // mqdefault 320x180 would look blurry on HiDPI screens so it is the last resort.
  const youtubeSources = ['maxresdefault', 'hqdefault', 'mqdefault'].map(
    (name) => `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/${name}.jpg`,
  )
  const sources = isLocalOnly(video)
    ? [localSource].filter((src): src is string => src !== null)
    : [localSource, ...youtubeSources].filter((src): src is string => src !== null)

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
      decoding="async"
      onError={() => setAttempt((current) => current + 1)}
      onLoad={(event) => {
        // YouTube answers a missing size with a 120x90 grey placeholder (status 404 but the body
        // is still an image, so no error event fires) — treat it as "not available" and fall back.
        if (event.currentTarget.naturalWidth <= 120 && attempt < sources.length - 1) {
          setAttempt((current) => current + 1)
        }
      }}
      // -1px bleed hides sub-pixel gaps without rescaling (scale() made the image soft).
      className="absolute -inset-px size-[calc(100%+2px)] max-w-none object-cover"
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
  thumbnailVersions,
}: YoutubeChannelVideoCardsProps) {
  const { t, i18n } = useTranslation('youtube')

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
            role="group"
            aria-label={video.title}
            aria-selected={selected}
            tabIndex={0}
            onClick={(event) => {
              if (!isInteractiveTarget(event.target)) onToggleRow(video.id)
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault()
                onToggleRow(video.id)
              }
            }}
            className={cn(
              'group cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-primary-500/50 hover:shadow-lg hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              selected && 'border-primary-500/60 ring-1 ring-primary-500',
            )}
          >
            <div className="relative aspect-video overflow-hidden bg-surface-elevated">
              <Thumbnail channelId={channelId} video={video} version={thumbnailVersions?.[video.id]} />
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition-all',
                  selected
                    ? 'scale-100 border-primary-500 bg-primary-500 text-on-primary shadow-md'
                    : 'scale-90 border-white/70 bg-black/30 text-transparent opacity-0 group-hover:opacity-100',
                )}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
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
                    className="-mx-1.5 -my-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MessageCircle className="size-3" />
                    {video.commentCount != null ? formatCompact(video.commentCount) : '—'}
                  </button>
                ) : null}
                {video.status === 'Published' && video.publishedAt ? (
                  <span
                    className="ml-auto inline-flex items-center gap-1"
                    title={t('videos.publishedAtTitle')}
                  >
                    <CalendarDays className="size-3" aria-hidden="true" />
                    {formatPublishedDate(video.publishedAt, i18n.language)}
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
