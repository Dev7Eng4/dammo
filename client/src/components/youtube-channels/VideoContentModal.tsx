import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchYoutubeVideoContent,
  markYoutubeVideoUploaded,
  updateYoutubeVideoContent,
} from '../../api/youtubeChannels';
import { isAbortError } from '../../api/http';
import { useTaskQueue } from '../../hooks';
import type { YoutubeChannelVideo, YoutubeVideoContent } from '../../types/youtubeChannel';
import type { CreateVideoTaskPayload } from '../../types/taskQueue';
import { Button, Image, Input, Modal, Textarea, useToast } from '../ui';
import { RegenerateMetadataConfirmModal } from './RegenerateMetadataConfirmModal';

interface VideoContentModalProps {
  open: boolean;
  channelId: string;
  video: YoutubeChannelVideo;
  canRegenerateMetadata?: boolean;
  onClose: () => void;
  onSaved: (content: YoutubeVideoContent) => void;
  onMarkedUploaded: (videoId: string) => void;
  onVideoCreated?: (videoId: string) => void;
}

const THUMBNAIL_ACCEPT = 'image/jpeg,image/png,image/webp';
const THUMBNAIL_MAX_SIZE_BYTES = 10 * 1024 * 1024;

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '');
}

function FieldCopyButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  const { t } = useTranslation('youtube');
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
  );
}

function isRegenerateMetadataJobForVideo(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoId: string,
): boolean {
  if (!payload || payload.regenerateMetadata !== true) return false;
  if (payload.channelId !== channelId) return false;
  return Boolean(payload.videoIds?.includes(videoId));
}

function isAssembleOnlyJobForVideo(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoId: string,
): boolean {
  if (!payload || payload.assembleOnly !== true) return false;
  if (payload.channelId !== channelId) return false;
  return Boolean(payload.videoIds?.includes(videoId));
}

export function VideoContentModal({
  open,
  channelId,
  video,
  canRegenerateMetadata = false,
  onClose,
  onSaved,
  onMarkedUploaded,
  onVideoCreated,
}: VideoContentModalProps) {
  const { t } = useTranslation('youtube');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();
  const { enqueueTask, jobs } = useTaskQueue();
  const [content, setContent] = useState<YoutubeVideoContent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [enqueueingRegenerate, setEnqueueingRegenerate] = useState(false);
  const [enqueueingAssemble, setEnqueueingAssemble] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const thumbnailPreviewUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const [contentCacheBust, setContentCacheBust] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const regenerateInProgress = jobs.some(
    job =>
      (job.status === 'queued' || job.status === 'running') &&
      isRegenerateMetadataJobForVideo(job.payload as CreateVideoTaskPayload, channelId, video.id),
  );
  const assembleInProgress = jobs.some(
    job =>
      (job.status === 'queued' || job.status === 'running') &&
      isAssembleOnlyJobForVideo(job.payload as CreateVideoTaskPayload, channelId, video.id),
  );
  const busy =
    saving || marking || enqueueingRegenerate || enqueueingAssemble || regenerateInProgress || assembleInProgress;

  function clearSelectedThumbnail() {
    if (thumbnailPreviewUrlRef.current) {
      URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
      thumbnailPreviewUrlRef.current = null;
    }
    setThumbnailFile(null);
    setThumbnailPreviewUrl(null);
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  }

  function applyContent(data: YoutubeVideoContent) {
    clearSelectedThumbnail();
    setContent(data);
    setTitle(data.title);
    setDescription(data.description);
    setTags(data.tags);
  }

  async function reloadContent() {
    const data = await fetchYoutubeVideoContent(channelId, video.id);
    onSaved(data);
    if (!mountedRef.current) return data;
    setContentCacheBust(value => value + 1);
    applyContent(data);
    return data;
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    void fetchYoutubeVideoContent(channelId, video.id, { signal: controller.signal })
      .then(data => {
        applyContent(data);
      })
      .catch(err => {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : t('videoContent.loadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when modal opens for a video
  }, [channelId, open, video.id]);

  useEffect(
    () => () => {
      if (thumbnailPreviewUrlRef.current) {
        URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
      }
    },
    [],
  );

  function addTag(rawValue = tagDraft) {
    const nextTag = normalizeTag(rawValue);
    if (
      !nextTag ||
      nextTag.length > 100 ||
      tags.length >= 100 ||
      tags.some(tag => tag.toLowerCase() === nextTag.toLowerCase())
    ) {
      setTagDraft('');
      return;
    }
    setTags(current => [...current, nextTag]);
    setTagDraft('');
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
      return;
    }
    if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
      setTags(current => current.slice(0, -1));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || busy) return;
    const pendingTag = normalizeTag(tagDraft);
    const submittedTags =
      pendingTag && !tags.some(tag => tag.toLowerCase() === pendingTag.toLowerCase())
        ? [...tags, pendingTag]
        : tags;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateYoutubeVideoContent(
        channelId,
        video.id,
        {
          title: normalizedTitle,
          description,
          tags: submittedTags,
        },
        thumbnailFile,
      );
      applyContent(updated);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('videoContent.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const handleClose = () => {
    if (saving || marking || enqueueingRegenerate) return;
    clearSelectedThumbnail();
    onClose();
  };

  async function handleMarkUploaded() {
    if (loading || busy || video.status !== 'Created') return;

    // Release the video.mp4 file handle so Windows can move the folder
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    }

    setMarking(true);
    setError(null);
    try {
      await markYoutubeVideoUploaded(channelId, video.id);
      toast.success(t('videoContent.markSuccess'));
      onMarkedUploaded(video.id);
      clearSelectedThumbnail();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('videoContent.markError');
      setError(message);
      toast.error(message);
    } finally {
      setMarking(false);
    }
  }

  async function handleConfirmRegenerate() {
    if (!canRegenerateMetadata || busy) return;

    setEnqueueingRegenerate(true);
    setError(null);
    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('videoContent.regenJobTitle', { title: video.title || video.id }),
          subtitle: video.id,
          payload: {
            channelId,
            videoIds: [video.id],
            regenerateMetadata: true,
          },
        },
        {
          onComplete: () => {
            void reloadContent()
              .then(() => {
                if (mountedRef.current) toast.success(t('videoContent.regenSuccess'));
              })
              .catch(err => {
                const message =
                  err instanceof Error ? err.message : t('videoContent.regenReloadError');
                if (mountedRef.current) setError(message);
                toast.error(message);
              });
          },
          onFail: job => {
            const message = job.error ?? t('videoContent.regenFailed');
            if (mountedRef.current) setError(message);
            toast.error(message);
          },
        },
      );
      setConfirmRegenerateOpen(false);
      toast.success(t('videoContent.regenQueued'));
    } catch {
      // enqueueTask already toasts
    } finally {
      setEnqueueingRegenerate(false);
    }
  }

  async function handleAssembleVideo() {
    if (video.status !== 'Prepared' || busy) return;

    setEnqueueingAssemble(true);
    setError(null);
    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('videoContent.assembleJobTitle', { title: video.title || video.id }),
          subtitle: video.id,
          payload: {
            channelId,
            videoIds: [video.id],
            assembleOnly: true,
          },
        },
        {
          onComplete: () => {
            onVideoCreated?.(video.id);
            void reloadContent()
              .then(() => {
                if (mountedRef.current) toast.success(t('videoContent.assembleSuccess'));
              })
              .catch(err => {
                const message =
                  err instanceof Error ? err.message : t('videoContent.assembleReloadError');
                if (mountedRef.current) setError(message);
                toast.error(message);
              });
          },
          onFail: job => {
            const message = job.error ?? t('videoContent.assembleFailed');
            if (mountedRef.current) setError(message);
            toast.error(message);
          },
        },
      );
      toast.success(t('videoContent.assembleQueued'));
    } catch {
      // enqueueTask already toasts
    } finally {
      setEnqueueingAssemble(false);
    }
  }

  function handleThumbnailChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!THUMBNAIL_ACCEPT.split(',').includes(file.type)) {
      toast.error(t('videoContent.thumbFormatError'));
      return;
    }
    if (file.size > THUMBNAIL_MAX_SIZE_BYTES) {
      toast.error(t('videoContent.thumbSizeError'));
      return;
    }

    if (thumbnailPreviewUrlRef.current) {
      URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    thumbnailPreviewUrlRef.current = previewUrl;
    setThumbnailFile(file);
    setThumbnailPreviewUrl(previewUrl);
  }

  async function handleCopyVideoFolderPath() {
    if (!content?.videoFolderPath) return;

    try {
      await navigator.clipboard.writeText(content.videoFolderPath);
      toast.success(t('videoContent.copyFolderSuccess'));
    } catch {
      toast.error(t('videoContent.copyFolderError'));
    }
  }

  async function copyText(text: string, label: string) {
    const value = text.trim();
    if (!value || busy) return;

    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('metadata.copySuccess', { label }));
    } catch {
      toast.error(t('metadata.copyError', { label }));
    }
  }

  function getTagsCopyText(): string {
    const pendingTag = normalizeTag(tagDraft);
    const tagsToCopy =
      pendingTag && !tags.some(tag => tag.toLowerCase() === pendingTag.toLowerCase())
        ? [...tags, pendingTag]
        : tags;
    return tagsToCopy.join(', ');
  }

  const withCacheBust = (url: string | null | undefined) => {
    if (!url) return null;
    if (contentCacheBust <= 0) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${contentCacheBust}`;
  };
  const thumbnailSrc = thumbnailPreviewUrl ?? withCacheBust(content?.thumbnailUrl) ?? null;

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={t('videoContent.title')}
        className="max-w-5xl"
        bodyClassName="max-h-[calc(100svh-10rem)] overflow-y-auto"
        footer={
          <>
            <Button
              variant="secondary"
              className="mr-auto"
              onClick={() => void handleCopyVideoFolderPath()}
              disabled={!content?.videoFolderPath || busy}
              title={t('videoContent.copyFolderTitle')}
            >
              Copy path
            </Button>
            {canRegenerateMetadata ? (
              <Button
                variant="outlined"
                onClick={() => setConfirmRegenerateOpen(true)}
                disabled={loading || busy || !content}
              >
                {regenerateInProgress ? t('videoContent.regenerating') : t('videoContent.regenerate')}
              </Button>
            ) : null}
            {video.status === 'Prepared' ? (
              <Button
                variant="outlined"
                onClick={() => void handleAssembleVideo()}
                disabled={loading || busy || !content}
              >
                {assembleInProgress || enqueueingAssemble ? t('videoContent.creating') : t('videoContent.createVideo')}
              </Button>
            ) : null}
            {video.status === 'Created' ? (
              <Button
                variant="outlined"
                onClick={() => void handleMarkUploaded()}
                disabled={loading || busy || !content}
              >
                {marking ? t('videoContent.marking') : t('videoContent.markUploaded')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={saving || marking || enqueueingRegenerate || enqueueingAssemble}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="submit"
              form="video-content-form"
              disabled={loading || busy || !content || !title.trim()}
            >
              {saving ? tCommon('actions.saving') : tCommon('actions.save')}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="space-y-4" aria-label={t('videoContent.loadingAria')}>
            <div className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            <div className="h-28 animate-pulse rounded-xl bg-neutral-800" />
            <div className="aspect-video animate-pulse rounded-xl bg-neutral-800" />
          </div>
        ) : error && !content ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        ) : content ? (
          <form id="video-content-form" onSubmit={handleSubmit} className="space-y-5">
            {error ? (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="video-content-title" className="text-sm font-medium text-neutral-200">
                  {t('metadata.fieldTitle')}
                </label>
                <FieldCopyButton
                  label={t('metadata.fieldTitle')}
                  disabled={!title.trim() || busy}
                  onClick={() => void copyText(title, t('metadata.fieldTitle'))}
                />
              </div>
              <Input
                id="video-content-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={100}
                className="h-10 rounded-lg"
                disabled={busy}
                required
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="video-content-description" className="text-sm font-medium text-neutral-200">
                  {t('metadata.fieldDescription')}
                </label>
                <FieldCopyButton
                  label={t('metadata.fieldDescription')}
                  disabled={!description.trim() || busy}
                  onClick={() => void copyText(description, t('metadata.fieldDescription'))}
                />
              </div>
              <Textarea
                id="video-content-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                maxLength={5000}
                rows={6}
                disabled={busy}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="video-content-tags" className="text-sm font-medium text-neutral-200">
                  {t('metadata.fieldTags')}
                </label>
                <FieldCopyButton
                  label={t('metadata.fieldTags')}
                  disabled={!getTagsCopyText() || busy}
                  onClick={() => void copyText(getTagsCopyText(), t('metadata.fieldTags'))}
                />
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/30">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags(current => current.filter(item => item !== tag))}
                      className="rounded text-neutral-500 hover:text-neutral-100"
                      aria-label={t('videoContent.tagDeleteAria', { tag })}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="video-content-tags"
                  value={tagDraft}
                  onChange={event => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag()}
                  placeholder={tags.length === 0 ? t('videoContent.tagPlaceholderEmpty') : t('videoContent.tagPlaceholderAdd')}
                  className="min-w-48 flex-1 bg-transparent py-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                  disabled={busy}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-200">{t('metadata.fieldThumbnail')}</h3>
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept={THUMBNAIL_ACCEPT}
                  className="hidden"
                  onChange={handleThumbnailChange}
                  disabled={busy}
                />
                {thumbnailSrc ? (
                  <div className="group relative">
                    <Image
                      key={thumbnailSrc}
                      src={thumbnailSrc}
                      alt={`Thumbnail ${title || video.title}`}
                      aspectRatio="video"
                      fit="contain"
                      className="border border-border"
                      fallback={<span className="px-4 text-center text-sm">{t('metadata.thumbnailError')}</span>}
                    />
                    <button
                      type="button"
                      onClick={() => thumbnailInputRef.current?.click()}
                      disabled={busy}
                      className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-lg border border-white/15 bg-black/70 text-white opacity-0 shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100 group-focus-within:opacity-100"
                      title={t('videoContent.changeThumb')}
                      aria-label={t('videoContent.changeThumb')}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="size-4"
                        aria-hidden="true"
                      >
                        <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => thumbnailInputRef.current?.click()}
                    disabled={busy}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-neutral-900 text-neutral-500 transition hover:border-primary-400/60 hover:bg-surface-elevated hover:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t('videoContent.uploadThumb')}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="size-7"
                      aria-hidden="true"
                    >
                      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                    </svg>
                    <span className="text-sm font-medium">{t('videoContent.uploadThumb')}</span>
                  </button>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-200">{t('videoContent.oldThumb')}</h3>
                <Image
                  src={withCacheBust(content.oldThumbnailUrl)}
                  alt={`${t('videoContent.oldThumb')} ${title || video.title}`}
                  aspectRatio="video"
                  fit="contain"
                  className="border border-border"
                  fallback={<span className="px-4 text-center text-sm">{t('videoContent.oldThumbMissing')}</span>}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-neutral-200">{t('metadata.fieldVideo')}</h3>
                {content.videoUrl ? (
                  <video
                    ref={videoRef}
                    key={content.videoUrl}
                    src={content.videoUrl}
                    controls
                    preload="metadata"
                    className="aspect-video w-full rounded-xl border border-border bg-black object-contain"
                  >
                    {t('videoContent.noVideoSupport')}
                  </video>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-neutral-900 px-4 text-center text-sm text-neutral-500">
                    {t('videoContent.videoMissing')}
                  </div>
                )}
              </section>
            </div>
          </form>
        ) : null}
      </Modal>

      <RegenerateMetadataConfirmModal
        open={confirmRegenerateOpen}
        regenerating={enqueueingRegenerate}
        onClose={() => setConfirmRegenerateOpen(false)}
        onConfirm={() => void handleConfirmRegenerate()}
      />
    </>
  );
}
