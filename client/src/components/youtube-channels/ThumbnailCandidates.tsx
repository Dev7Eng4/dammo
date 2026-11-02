import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchThumbnailCandidates,
  selectThumbnailCandidate,
  type ThumbnailCandidateItem,
} from '../../api/youtubeChannels';
import { isAbortError } from '../../api/http';
import { cn } from '../../lib/cn';
import type { YoutubeVideoContent } from '../../types/youtubeChannel';
import { useToast } from '../ui';

interface ThumbnailCandidatesProps {
  channelId: string;
  videoId: string;
  /** Bump to reload (e.g. after metadata + thumbnail were regenerated). */
  reloadKey: number;
  disabled?: boolean;
  /** Set when switching is blocked (e.g. an uploaded image is not saved yet). */
  disabledReason?: string;
  onSelected: (content: YoutubeVideoContent) => void;
}

/** Mascot thumbnail candidates under the video thumbnail; renders nothing when the video has none. */
export function ThumbnailCandidates({
  channelId,
  videoId,
  reloadKey,
  disabled = false,
  disabledReason,
  onSelected,
}: ThumbnailCandidatesProps) {
  const { t } = useTranslation('youtube');
  const { toast } = useToast();
  const [items, setItems] = useState<ThumbnailCandidateItem[]>([]);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchThumbnailCandidates(channelId, videoId, { signal: controller.signal })
      .then(data => {
        setItems(data.items);
        setJudgeError(data.judgeError);
      })
      .catch(err => {
        if (!isAbortError(err)) setItems([]);
      });
    return () => controller.abort();
  }, [channelId, videoId, reloadKey, version]);

  if (items.length === 0) return null;

  async function handleSelect(file: string) {
    setSelecting(file);
    try {
      const updated = await selectThumbnailCandidate(channelId, videoId, file);
      onSelected(updated);
      setVersion(value => value + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('metadata.thumbnailCandidateSelectError'));
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-neutral-400">{t('metadata.thumbnailCandidates')}</p>
      {judgeError ? (
        <p className="mb-2 text-[11px] text-warning" title={judgeError}>
          {t('metadata.thumbnailJudgeFailed')}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, index) => {
          const file = item.file;
          const busy = selecting !== null;
          return (
            <figure
              key={file ?? `failed-${index}`}
              className={cn(
                'overflow-hidden rounded-lg border bg-neutral-900',
                item.selected ? 'border-primary-400' : 'border-border',
              )}
            >
              <div className="relative aspect-video">
                {item.url ? (
                  <img src={item.url} alt={item.hookLines.join(' ')} loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-neutral-500">
                    <ImageOff className="size-5" aria-hidden="true" />
                    <span className="text-[11px]">{t('metadata.thumbnailCandidateFailed')}</span>
                  </div>
                )}
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  {item.selected ? (
                    <span className="rounded bg-primary-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                      {t('metadata.thumbnailCandidateSelected')}
                    </span>
                  ) : null}
                  {item.aiPicked ? (
                    <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {t('metadata.thumbnailCandidateAiPicked')}
                    </span>
                  ) : null}
                </div>
                {item.judgement ? (
                  <span
                    className="absolute right-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    title={t('metadata.thumbnailJudgeBreakdown', { ...item.judgement })}
                  >
                    {item.judgement.score.toFixed(1)}
                  </span>
                ) : null}
              </div>
              <figcaption className="space-y-1.5 p-2">
                <p className="truncate text-[11px] text-neutral-400" title={item.hookLines.join(' / ')}>
                  {item.angle || item.hookLines.join(' / ')}
                </p>
                {item.judgement ? (
                  <div className="space-y-0.5 text-[11px] leading-snug">
                    <p
                      className={item.judgement.textCorrect ? 'text-success' : 'text-danger'}
                      title={item.judgement.textIssues || undefined}
                    >
                      {item.judgement.textCorrect
                        ? t('metadata.thumbnailTextCorrect')
                        : t('metadata.thumbnailTextWrong', { issues: item.judgement.textIssues || '—' })}
                    </p>
                    {item.judgement.reason ? (
                      <p className="line-clamp-2 text-neutral-500" title={item.judgement.reason}>
                        {item.judgement.reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {file && !item.selected ? (
                  <button
                    type="button"
                    onClick={() => void handleSelect(file)}
                    disabled={disabled || busy}
                    title={disabled ? disabledReason : undefined}
                    className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs text-neutral-200 transition hover:border-primary-400/60 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selecting === file ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                    {t('metadata.thumbnailCandidateUse')}
                  </button>
                ) : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
