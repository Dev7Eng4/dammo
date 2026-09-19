import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchRecreateMetadataContent } from '../../api/youtubeChannels'
import { useTaskQueue } from '../../hooks'
import type { YoutubeVideoContent } from '../../types/youtubeChannel'
import type { CreateVideoTaskPayload } from '../../types/taskQueue'
import { canonicalizeYoutubeVideoUrl, extractYoutubeVideoId } from '../../utils/youtubeVideoUrl'
import { Button, Image, Input, Modal, Textarea, useToast } from '../ui'

interface RecreateMetadataModalProps {
  open: boolean
  channelId: string
  onClose: () => void
}

function FieldCopyButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  const { t } = useTranslation('youtube')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={t('metadata.copyLabel', { label })}
      aria-label={t('metadata.copyLabel', { label })}
      className="inline-flex size-6 items-center justify-center rounded text-neutral-500 transition hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

function isRecreateMetadataJob(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoUrl: string,
): boolean {
  if (!payload || payload.recreateMetadataFromUrl !== true) return false
  if (payload.channelId !== channelId) return false
  return payload.videoUrl?.trim() === videoUrl.trim()
}

export function RecreateMetadataModal({ open, channelId, onClose }: RecreateMetadataModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const { enqueueTask, jobs } = useTaskQueue()
  const [videoUrl, setVideoUrl] = useState('')
  const [content, setContent] = useState<YoutubeVideoContent | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [enqueueing, setEnqueueing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentCacheBust, setContentCacheBust] = useState(0)
  const mountedRef = useRef(true)
  const activeVideoIdRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setVideoUrl('')
    setContent(null)
    setTitle('')
    setDescription('')
    setTags([])
    setError(null)
    setLoadingContent(false)
    setEnqueueing(false)
    setContentCacheBust(0)
    activeVideoIdRef.current = null
  }, [open])

  const trimmedUrl = videoUrl.trim()
  const recreateInProgress = jobs.some(
    job =>
      (job.status === 'queued' || job.status === 'running') &&
      isRecreateMetadataJob(job.payload as CreateVideoTaskPayload, channelId, trimmedUrl),
  )
  const busy = enqueueing || recreateInProgress || loadingContent

  function applyContent(data: YoutubeVideoContent) {
    setContent(data)
    setTitle(data.title)
    setDescription(data.description)
    setTags(data.tags)
  }

  async function reloadContent() {
    setLoadingContent(true)
    try {
      const data = await fetchRecreateMetadataContent(channelId)
      if (!mountedRef.current) return data
      setContentCacheBust(value => value + 1)
      applyContent(data)
      return data
    } finally {
      if (mountedRef.current) setLoadingContent(false)
    }
  }

  async function handleCreateMetadata() {
    if (busy) return

    if (!trimmedUrl) {
      setError(t('metadata.linkRequired'))
      return
    }

    let url: string
    try {
      url = canonicalizeYoutubeVideoUrl(trimmedUrl)
    } catch {
      setError(t('metadata.invalidUrl'))
      return
    }

    setVideoUrl(url)
    const youtubeVideoId = extractYoutubeVideoId(url)
    if (!youtubeVideoId) {
      setError(t('metadata.invalidUrl'))
      return
    }

    activeVideoIdRef.current = youtubeVideoId
    setEnqueueing(true)
    setError(null)
    setContent(null)
    setTitle('')
    setDescription('')
    setTags([])

    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('metadata.fromLinkJobTitle'),
          subtitle: youtubeVideoId,
          payload: {
            channelId,
            videoUrl: url,
            recreateMetadataFromUrl: true,
          },
        },
        {
          onComplete: () => {
            void reloadContent()
              .then(() => {
                if (mountedRef.current) toast.success(t('metadata.success'))
              })
              .catch(err => {
                const message =
                  err instanceof Error ? err.message : t('metadata.reloadError')
                if (mountedRef.current) setError(message)
                toast.error(message)
              })
          },
          onFail: job => {
            const message = job.error ?? t('metadata.failed')
            if (mountedRef.current) setError(message)
            toast.error(message)
          },
        },
      )
      toast.success(t('metadata.queued'))
    } catch {
      // enqueueTask already toasts
    } finally {
      if (mountedRef.current) setEnqueueing(false)
    }
  }

  function handleClose() {
    if (busy) return
    onClose()
  }

  async function copyText(text: string, label: string) {
    const value = text.trim()
    if (!value || busy) return

    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('metadata.copySuccess', { label }))
    } catch {
      toast.error(t('metadata.copyError', { label }))
    }
  }

  async function handleCopyFolderPath() {
    if (!content?.videoFolderPath) return
    await copyText(content.videoFolderPath, t('metadata.folderPathLabel'))
  }

  const withCacheBust = (url: string | null | undefined) => {
    if (!url) return null
    if (contentCacheBust <= 0) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}v=${contentCacheBust}`
  }
  const thumbnailSrc = withCacheBust(content?.thumbnailUrl) ?? null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('metadata.title')}
      className="max-w-5xl"
      bodyClassName="max-h-[calc(100svh-10rem)] overflow-y-auto"
      footer={
        <>
          <Button
            variant="secondary"
            className="mr-auto"
            onClick={() => void handleCopyFolderPath()}
            disabled={!content?.videoFolderPath || busy}
            title={t('metadata.copyFolderPath')}
          >
            {t('metadata.copyFolderPath')}
          </Button>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {tCommon('actions.cancel')}
          </Button>
          <Button onClick={() => void handleCreateMetadata()} disabled={busy || !trimmedUrl}>
            {recreateInProgress || enqueueing ? t('metadata.creating') : t('metadata.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div>
          <label htmlFor="recreate-metadata-video-url" className="mb-1.5 block text-sm font-medium text-neutral-200">
            {t('metadata.videoLink')}
          </label>
          <Input
            id="recreate-metadata-video-url"
            value={videoUrl}
            onChange={event => setVideoUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            className="h-10 rounded-lg font-mono text-sm"
            disabled={busy}
          />
        </div>

        {loadingContent ? (
          <div className="space-y-4" aria-label={t('metadata.loadingAria')}>
            <div className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            <div className="h-28 animate-pulse rounded-xl bg-neutral-800" />
            <div className="aspect-video animate-pulse rounded-xl bg-neutral-800" />
          </div>
        ) : content ? (
          <>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="recreate-metadata-title" className="text-sm font-medium text-neutral-200">
                  {t('metadata.fieldTitle')}
                </label>
                <FieldCopyButton
                  label={t('metadata.fieldTitle')}
                  disabled={!title.trim() || busy}
                  onClick={() => void copyText(title, t('metadata.fieldTitle'))}
                />
              </div>
              <Input id="recreate-metadata-title" value={title} readOnly className="h-10 rounded-lg" />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label
                  htmlFor="recreate-metadata-description"
                  className="text-sm font-medium text-neutral-200"
                >
                  {t('metadata.fieldDescription')}
                </label>
                <FieldCopyButton
                  label={t('metadata.fieldDescription')}
                  disabled={!description.trim() || busy}
                  onClick={() => void copyText(description, t('metadata.fieldDescription'))}
                />
              </div>
              <Textarea id="recreate-metadata-description" value={description} readOnly rows={6} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-200">{t('metadata.fieldTags')}</span>
                <FieldCopyButton
                  label={t('metadata.fieldTags')}
                  disabled={tags.length === 0 || busy}
                  onClick={() => void copyText(tags.join(', '), t('metadata.fieldTags'))}
                />
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2">
                {tags.length === 0 ? (
                  <span className="text-sm text-neutral-500">{t('metadata.noTags')}</span>
                ) : (
                  tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-md border border-border bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                    >
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-200">{t('metadata.fieldThumbnail')}</h3>
                {thumbnailSrc ? (
                  <Image
                    key={thumbnailSrc}
                    src={thumbnailSrc}
                    alt={`${t('metadata.fieldThumbnail')} ${title || activeVideoIdRef.current || 'video'}`}
                    aspectRatio="video"
                    fit="contain"
                    className="border border-border"
                    fallback={
                      <span className="px-4 text-center text-sm">{t('metadata.thumbnailError')}</span>
                    }
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-neutral-900 px-4 text-center text-sm text-neutral-500">
                    {t('metadata.noThumbnail')}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
