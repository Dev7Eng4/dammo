import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, Pencil } from 'lucide-react';
import { updateYoutubeVideoContent } from '../../api/youtubeChannels';
import { API_V1 } from '../../api/config';
import { Input, Textarea, useToast } from '../ui';
import type { ProductionMetadataResponse } from '../../types/videoProductionScenes';

const THUMBNAIL_ACCEPT = 'image/jpeg,image/png,image/webp';
const THUMBNAIL_MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface MetadataPanelProps {
  channelId: string;
  videoId: string;
  data: ProductionMetadataResponse | null;
  loading: boolean;
  error: string | null;
  onSaved: (metadata: ProductionMetadataResponse) => void;
  onSaveStateChange?: (state: { canSave: boolean; saving: boolean }) => void;
}

export const PRODUCTION_METADATA_FORM_ID = 'production-metadata-form';

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '');
}

function withCacheBust(url: string | null | undefined): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

export function MetadataPanel({
  channelId,
  videoId,
  data,
  loading,
  error,
  onSaved,
  onSaveStateChange,
}: MetadataPanelProps) {
  const { t } = useTranslation('factory');
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [savedThumbnailUrl, setSavedThumbnailUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const thumbnailPreviewUrlRef = useRef<string | null>(null);

  const canSave = !loading && !saving && Boolean(title.trim());

  useEffect(() => {
    onSaveStateChange?.({ canSave, saving });
  }, [canSave, saving, onSaveStateChange]);

  useEffect(() => {
    setTitle(data?.title ?? '');
    setDescription(data?.description ?? '');
    setTags(data?.tags ?? []);
    setTagDraft('');
    setThumbnailFile(null);
    setSavedThumbnailUrl(data?.thumbnailUrl ?? null);
    setSaveError(null);
    setImageFailed(false);
    if (thumbnailPreviewUrlRef.current) {
      URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
      thumbnailPreviewUrlRef.current = null;
    }
    setThumbnailPreviewUrl(null);
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  }, [data, channelId, videoId]);

  useEffect(() => {
    return () => {
      if (thumbnailPreviewUrlRef.current) {
        URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
      }
    };
  }, []);

  function addTag(rawValue = tagDraft) {
    const nextTag = normalizeTag(rawValue);
    if (
      !nextTag ||
      nextTag.length > 100 ||
      tags.length >= 100 ||
      tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())
    ) {
      setTagDraft('');
      return;
    }
    setTags((current) => [...current, nextTag]);
    setTagDraft('');
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
      return;
    }
    if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  }

  function handleThumbnailChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!THUMBNAIL_ACCEPT.split(',').includes(file.type)) {
      toast.error(t('production.metadata.thumbFormatError'));
      return;
    }
    if (file.size > THUMBNAIL_MAX_SIZE_BYTES) {
      toast.error(t('production.metadata.thumbSizeError'));
      return;
    }

    if (thumbnailPreviewUrlRef.current) {
      URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    thumbnailPreviewUrlRef.current = previewUrl;
    setThumbnailFile(file);
    setThumbnailPreviewUrl(previewUrl);
    setImageFailed(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || saving || loading) return;

    const pendingTag = normalizeTag(tagDraft);
    const submittedTags =
      pendingTag && !tags.some((tag) => tag.toLowerCase() === pendingTag.toLowerCase())
        ? [...tags, pendingTag]
        : tags;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateYoutubeVideoContent(
        channelId,
        videoId,
        {
          title: normalizedTitle,
          description,
          tags: submittedTags,
        },
        thumbnailFile,
      );

      const fallbackThumb = `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/thumbnail`;
      const nextThumbnailUrl =
        updated.hasThumbnail || thumbnailFile
          ? withCacheBust(savedThumbnailUrl ?? data?.thumbnailUrl ?? fallbackThumb)
          : null;

      const nextMetadata: ProductionMetadataResponse = {
        channelId,
        videoId,
        title: updated.title,
        description: updated.description,
        tags: updated.tags,
        thumbnailUrl: nextThumbnailUrl,
      };

      setTitle(updated.title);
      setDescription(updated.description);
      setTags(updated.tags);
      setTagDraft('');
      setThumbnailFile(null);
      if (thumbnailPreviewUrlRef.current) {
        URL.revokeObjectURL(thumbnailPreviewUrlRef.current);
        thumbnailPreviewUrlRef.current = null;
      }
      setThumbnailPreviewUrl(null);
      setSavedThumbnailUrl(nextThumbnailUrl);
      setImageFailed(false);
      onSaved(nextMetadata);
      toast.success(t('production.metadata.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('production.metadata.saveError');
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t('production.metadata.loading')}
      </p>
    );
  }

  if (error && !data) {
    return <p className="px-4 py-6 text-sm text-danger">{error}</p>;
  }

  const thumbnailSrc = thumbnailPreviewUrl ?? withCacheBust(savedThumbnailUrl) ?? null;
  const showImage = Boolean(thumbnailSrc) && !imageFailed;
  const busy = saving;

  return (
    <form id={PRODUCTION_METADATA_FORM_ID} onSubmit={handleSubmit} className="space-y-5 px-4 py-4">
      {saveError || (error && data) ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {saveError ?? error}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-xl bg-muted">
          {showImage ? (
            <img
              key={thumbnailSrc}
              src={thumbnailSrc ?? undefined}
              alt=""
              loading="lazy"
              className="size-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="size-8" aria-hidden="true" />
              <span className="text-sm">{t('production.metadata.noThumbnail')}</span>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => thumbnailInputRef.current?.click()}
            className="absolute right-2 top-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-black/65 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {t('production.metadata.changeThumb')}
          </button>
        </div>
        <input
          ref={thumbnailInputRef}
          type="file"
          accept={THUMBNAIL_ACCEPT}
          className="hidden"
          onChange={handleThumbnailChange}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="production-metadata-title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('production.metadata.title')}
        </label>
        <Input
          id="production-metadata-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          disabled={busy}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="production-metadata-description" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('production.metadata.description')}
        </label>
        <Textarea
          id="production-metadata-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={5000}
          rows={6}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="production-metadata-tags" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('production.metadata.tags')}
        </label>
        <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-400/30">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                className="cursor-pointer rounded text-muted-foreground hover:text-foreground"
                aria-label={t('production.metadata.tagDeleteAria', { tag })}
                disabled={busy}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="production-metadata-tags"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => addTag()}
            placeholder={
              tags.length === 0
                ? t('production.metadata.tagPlaceholderEmpty')
                : t('production.metadata.tagPlaceholderAdd')
            }
            disabled={busy}
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </form>
  );
}
