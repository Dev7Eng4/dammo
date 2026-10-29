import { ExternalLink, Eye, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAbortError } from '../../api/http'
import { fetchSourceVideoComments } from '../../api/sourceChannels'
import { useAbortableEffect } from '../../hooks'
import type { SourceChannel, SourceChannelVideo } from '../../types/sourceChannel'
import type { YoutubeVideoComment } from '../../types/youtubeChannel'
import { formatCompact } from '../../utils/ypp'
import { youtubeWatchUrl } from '../../utils/youtubeVideo'
import { CommentThread } from '../youtube-channels/CommentThread'
import { Button, Modal } from '../ui'

interface SourceVideoModalProps {
  source: SourceChannel
  video: SourceChannelVideo | null
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
  const s = Math.floor(seconds % 60)
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
          </div>
        </div>
      ))}
    </div>
  )
}

export function SourceVideoModal({ source, video, onClose }: SourceVideoModalProps) {
  if (!video) return null
  return <SourceVideoDialog key={video.id} source={source} video={video} onClose={onClose} />
}

/**
 * Popup for a video of a source channel: embedded player, title and stats, then comments
 * (YouTube sources only — Facebook sources cannot be embedded or have comments fetched).
 */
function SourceVideoDialog({
  source,
  video,
  onClose,
}: SourceVideoModalProps & { video: SourceChannelVideo }) {
  const { t } = useTranslation('source')
  const { t: tYoutube } = useTranslation('youtube')
  const isYoutube = source.platform === 'youtube'
  const [comments, setComments] = useState<YoutubeVideoComment[]>([])
  const [loading, setLoading] = useState(isYoutube)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useAbortableEffect(
    async (signal) => {
      try {
        const data = await fetchSourceVideoComments(source.id, video.id, { signal })
        setComments(data.items)
        setError(null)
      } catch (err) {
        if (isAbortError(err)) return
        setComments([])
        setError(err instanceof Error ? err.message : tYoutube('comments.loadError'))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [source.id, video.id, reloadKey],
    { enabled: isYoutube },
  )

  const total = countAllComments(comments)
  const openUrl = isYoutube ? youtubeWatchUrl(video.id) : video.url

  return (
    <Modal
      open
      onClose={onClose}
      title={t('videoModal.title')}
      className="max-w-[min(1100px,calc(100vw-3rem))]"
      bodyClassName="max-h-[calc(100svh-9rem)] overflow-y-auto"
    >
      <div className="space-y-4">
        {isYoutube ? (
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="size-full"
            />
          </div>
        ) : null}

        <div>
          <h2 className="text-xl font-semibold leading-snug text-foreground">{video.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-4" aria-hidden="true" />
              {video.viewCount != null ? formatCompact(video.viewCount) : '—'} {t('videoModal.views')}
            </span>
            {video.duration != null ? <span>{formatDuration(video.duration)}</span> : null}
            <span>{source.name}</span>
            {video.status === 'Downloaded' ? (
              <span className="text-xs font-medium text-primary-400">{t('videos.downloaded')}</span>
            ) : null}
            <Button variant="outlined" size="sm" className="ml-auto rounded-lg" asChild>
              <a href={openUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {isYoutube ? t('videoModal.openOnYoutube') : t('videoModal.openOriginal')}
              </a>
            </Button>
          </div>
        </div>

        {isYoutube ? (
          <section className="border-t border-border pt-4" aria-label={tYoutube('comments.title')}>
            <h3 className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageCircle className="size-4" aria-hidden="true" />
              {loading
                ? tYoutube('comments.title')
                : tYoutube('comments.count', { count: total.toLocaleString('vi-VN') })}
            </h3>

            {loading ? <CommentsSkeleton /> : null}

            {error ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-danger">{error}</p>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => {
                    setLoading(true)
                    setReloadKey((key) => key + 1)
                  }}
                >
                  {t('videoModal.retry')}
                </Button>
              </div>
            ) : null}

            {!loading && !error && comments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {tYoutube('comments.noneFound')}
              </p>
            ) : null}

            {!loading && !error && comments.length > 0 ? (
              <div className="space-y-6">
                {comments.map((comment) => (
                  <CommentThread key={comment.id} comment={comment} />
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            {t('videoModal.noPreview')}
          </p>
        )}
      </div>
    </Modal>
  )
}
