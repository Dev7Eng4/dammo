import { useEffect, useRef, useState } from 'react';
import { fetchRecreateMetadataContent } from '../../api/youtubeChannels';
import { isAbortError } from '../../api/http';
import { useTaskQueue } from '../../hooks';
import type { YoutubeVideoContent } from '../../types/youtubeChannel';
import type { CreateVideoTaskPayload } from '../../types/taskQueue';
import { canonicalizeYoutubeVideoUrl, extractYoutubeVideoId } from '../../utils/youtubeVideoUrl';
import { Button, Image, Input, Modal, Textarea, useToast } from '../ui';

interface RecreateMetadataModalProps {
  open: boolean;
  channelId: string;
  onClose: () => void;
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Sao chép ${label}`}
      aria-label={`Sao chép ${label}`}
      className="inline-flex size-6 items-center justify-center rounded text-neutral-500 transition hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function isRecreateMetadataJob(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoUrl: string,
): boolean {
  if (!payload || payload.recreateMetadataFromUrl !== true) return false;
  if (payload.channelId !== channelId) return false;
  return payload.videoUrl?.trim() === videoUrl.trim();
}

export function RecreateMetadataModal({ open, channelId, onClose }: RecreateMetadataModalProps) {
  const { toast } = useToast();
  const { enqueueTask, jobs } = useTaskQueue();
  const [videoUrl, setVideoUrl] = useState('');
  const [content, setContent] = useState<YoutubeVideoContent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentCacheBust, setContentCacheBust] = useState(0);
  const mountedRef = useRef(true);
  const activeVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setVideoUrl('');
    setContent(null);
    setTitle('');
    setDescription('');
    setTags([]);
    setError(null);
    setLoadingContent(false);
    setEnqueueing(false);
    setContentCacheBust(0);
    activeVideoIdRef.current = null;
  }, [open]);

  const trimmedUrl = videoUrl.trim();
  const recreateInProgress = jobs.some(
    job =>
      (job.status === 'queued' || job.status === 'running') &&
      isRecreateMetadataJob(job.payload as CreateVideoTaskPayload, channelId, trimmedUrl),
  );
  const busy = enqueueing || recreateInProgress || loadingContent;

  function applyContent(data: YoutubeVideoContent) {
    setContent(data);
    setTitle(data.title);
    setDescription(data.description);
    setTags(data.tags);
  }

  async function reloadContent() {
    setLoadingContent(true);
    try {
      const data = await fetchRecreateMetadataContent(channelId);
      if (!mountedRef.current) return data;
      setContentCacheBust(value => value + 1);
      applyContent(data);
      return data;
    } finally {
      if (mountedRef.current) setLoadingContent(false);
    }
  }

  async function handleCreateMetadata() {
    if (busy) return;

    if (!trimmedUrl) {
      setError('Link video là bắt buộc');
      return;
    }

    let url: string;
    try {
      url = canonicalizeYoutubeVideoUrl(trimmedUrl);
    } catch {
      setError('URL YouTube không hợp lệ');
      return;
    }

    setVideoUrl(url);
    const youtubeVideoId = extractYoutubeVideoId(url);
    if (!youtubeVideoId) {
      setError('URL YouTube không hợp lệ');
      return;
    }

    activeVideoIdRef.current = youtubeVideoId;
    setEnqueueing(true);
    setError(null);
    setContent(null);
    setTitle('');
    setDescription('');
    setTags([]);

    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: 'Tạo metadata từ link video',
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
                if (mountedRef.current) toast.success('Đã tạo metadata');
              })
              .catch(err => {
                const message =
                  err instanceof Error ? err.message : 'Không thể tải nội dung metadata sau khi tạo';
                if (mountedRef.current) setError(message);
                toast.error(message);
              });
          },
          onFail: job => {
            const message = job.error ?? 'Tạo metadata thất bại';
            if (mountedRef.current) setError(message);
            toast.error(message);
          },
        },
      );
      toast.success('Đã thêm vào hàng đợi tạo metadata');
    } catch {
      // enqueueTask already toasts
    } finally {
      if (mountedRef.current) setEnqueueing(false);
    }
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function copyText(text: string, label: string) {
    const value = text.trim();
    if (!value || busy) return;

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Đã sao chép ${label}`);
    } catch {
      toast.error(`Không thể sao chép ${label}`);
    }
  }

  async function handleCopyFolderPath() {
    if (!content?.videoFolderPath) return;
    await copyText(content.videoFolderPath, 'đường dẫn folder');
  }

  const withCacheBust = (url: string | null | undefined) => {
    if (!url) return null;
    if (contentCacheBust <= 0) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${contentCacheBust}`;
  };
  const thumbnailSrc = withCacheBust(content?.thumbnailUrl) ?? null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Tạo Metadata"
      className="max-w-5xl"
      bodyClassName="max-h-[calc(100svh-10rem)] overflow-y-auto"
      footer={
        <>
          <Button
            variant="secondary"
            className="mr-auto"
            onClick={() => void handleCopyFolderPath()}
            disabled={!content?.videoFolderPath || busy}
            title="Sao chép đường dẫn folder"
          >
            Copy path
          </Button>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={() => void handleCreateMetadata()} disabled={busy || !trimmedUrl}>
            {recreateInProgress || enqueueing ? 'Đang tạo…' : 'Tạo Metadata'}
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
            Link Video
          </label>
          <Input
            id="recreate-metadata-video-url"
            value={videoUrl}
            onChange={event => setVideoUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..."
            className="h-10 rounded-lg font-mono text-sm"
            disabled={busy}
          />
        </div>

        {loadingContent ? (
          <div className="space-y-4" aria-label="Đang tải metadata">
            <div className="h-10 animate-pulse rounded-lg bg-neutral-800" />
            <div className="h-28 animate-pulse rounded-xl bg-neutral-800" />
            <div className="aspect-video animate-pulse rounded-xl bg-neutral-800" />
          </div>
        ) : content ? (
          <>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="recreate-metadata-title" className="text-sm font-medium text-neutral-200">
                  Tiêu đề
                </label>
                <FieldCopyButton
                  label="tiêu đề"
                  disabled={!title.trim() || busy}
                  onClick={() => void copyText(title, 'tiêu đề')}
                />
              </div>
              <Input
                id="recreate-metadata-title"
                value={title}
                readOnly
                className="h-10 rounded-lg"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label htmlFor="recreate-metadata-description" className="text-sm font-medium text-neutral-200">
                  Mô tả
                </label>
                <FieldCopyButton
                  label="mô tả"
                  disabled={!description.trim() || busy}
                  onClick={() => void copyText(description, 'mô tả')}
                />
              </div>
              <Textarea
                id="recreate-metadata-description"
                value={description}
                readOnly
                rows={6}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-200">Tags</span>
                <FieldCopyButton
                  label="tags"
                  disabled={tags.length === 0 || busy}
                  onClick={() => void copyText(tags.join(', '), 'tags')}
                />
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2">
                {tags.length === 0 ? (
                  <span className="text-sm text-neutral-500">Không có tag</span>
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
                <h3 className="mb-2 text-sm font-medium text-neutral-200">Thumbnail</h3>
                {thumbnailSrc ? (
                  <Image
                    key={thumbnailSrc}
                    src={thumbnailSrc}
                    alt={`Thumbnail ${title || activeVideoIdRef.current || 'video'}`}
                    aspectRatio="video"
                    fit="contain"
                    className="border border-border"
                    fallback={<span className="px-4 text-center text-sm">Không thể hiển thị thumbnail</span>}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-neutral-900 px-4 text-center text-sm text-neutral-500">
                    Chưa có thumbnail
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
