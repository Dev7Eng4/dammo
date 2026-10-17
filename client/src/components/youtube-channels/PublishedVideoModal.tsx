import { ExternalLink, Eye, Heart, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAbortError } from '../../api/http'
import { fetchYoutubeVideoComments } from '../../api/youtubeChannels'
import { useAbortableEffect } from '../../hooks'
import type { YoutubeChannelVideo, YoutubeVideoComment } from '../../types/youtubeChannel'
import { formatCompact } from '../../utils/ypp'
import { youtubeWatchUrl } from '../../utils/youtubeVideo'
import { Button, Modal } from '../ui'
import { CommentThread } from './CommentThread'

interface PublishedVideoModalProps {
  open: boolean
  channelId: string
  video: YoutubeChannelVideo
  onClose: () => void
}

function countAllComments(comments: YoutubeVideoComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + (comment.replies ? countAllComments(comment.replies) : 0),
    0,
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function CommentsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="size-8 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Popup for videos published on YouTube: embedded player, title and stats, then the
 * comment list underneath (YouTube watch-page layout). No tabs — nothing local to edit.
 */
export function PublishedVideoModal({ open, channelId, video, onClose }: PublishedVideoModalProps) {
  const { t } = useTranslation('youtube')
  const [comments, setComments] = useState<YoutubeVideoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useAbortableEffect(
    async (signal) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchYoutubeVideoComments(channelId, video.id, { signal })
        setComments(data.items)
      } catch (err) {
        if (isAbortError(err)) return
        setComments([])
        setError(err instanceof Error ? err.message : t('comments.loadError'))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [channelId, video.id, reloadKey],
    { enabled: open },
  )

  const total = countAllComments(comments)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('publishedVideo.title')}
      className="max-w-[min(1100px,calc(100vw-3rem))]"
      bodyClassName="max-h-[calc(100svh-9rem)] overflow-y-auto"
    >
      <div className="space-y-4">
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
          <iframe
            key={video.id}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full"
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold leading-snug text-foreground">{video.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-4" aria-hidden="true" />
              {video.viewCount != null ? formatCompact(video.viewCount) : '—'} {t('publishedVideo.views')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="size-4" aria-hidden="true" />
              {video.likeCount != null ? formatCompact(video.likeCount) : '—'}
            </span>
            {video.duration ? <span>{formatDuration(video.duration)}</span> : null}
            <Button variant="outlined" size="sm" className="ml-auto rounded-lg" asChild>
              <a href={youtubeWatchUrl(video.id)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {t('publishedVideo.openOnYoutube')}
              </a>
            </Button>
          </div>
        </div>

        <section className="border-t border-border pt-4" aria-label={t('comments.title')}>
          <h3 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <MessageCircle className="size-4" aria-hidden="true" />
            {loading
              ? t('comments.title')
              : t('comments.count', { count: total.toLocaleString('vi-VN') })}
          </h3>

          {loading ? <CommentsSkeleton /> : null}

          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-danger">{error}</p>
              <Button variant="outlined" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                {t('publishedVideo.retry')}
              </Button>
            </div>
          ) : null}

          {!loading && !error && comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('comments.noneFound')}</p>
          ) : null}

          {!loading && !error && comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map((comment) => (
                <CommentThread key={comment.id} comment={comment} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </Modal>
  )
}
