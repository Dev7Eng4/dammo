import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelVideoReadingCheck } from '../../api/videoProduction';
import { deleteNarrationReading, fetchNarrationReadings, saveNarrationReading, type NarrationReading } from '../../api/voice';
import { useAbortableEffect } from '../../hooks';
import { Button, Input, useToast } from '../ui';

interface ReadingChecksPanelProps {
  checks: ChannelVideoReadingCheck[];
}

/** Words of the last narration VOICEVOX may have read wrong, with a field to fix each in the reading dictionary. */
export function ReadingChecksPanel({ checks }: ReadingChecksPanelProps) {
  const { t } = useTranslation('manual');
  const { toast } = useToast();
  const [dictionary, setDictionary] = useState<NarrationReading[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useAbortableEffect(async (signal) => {
    setDictionary((await fetchNarrationReadings({ signal })).items);
  }, []);

  async function guarded(action: () => Promise<{ items: NarrationReading[] }>, success?: string) {
    setBusy(true);
    try {
      setDictionary((await action()).items);
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {t('channelVideo.voice.readings.title', { count: checks.length })}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">{t('channelVideo.voice.readings.hint')}</p>
      <ul className="mt-3 space-y-3">
        {checks.map((check) => {
          const saved = dictionary.find((entry) => entry.surface === check.term);
          const draft = drafts[check.term] ?? '';
          return (
            <li key={check.term} className="space-y-1.5 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm text-foreground">
                <span lang="ja" className="font-semibold">
                  {check.term}
                </span>{' '}
                <span className="text-xs text-muted-foreground">
                  {t(`channelVideo.voice.readings.kind.${check.kind}`)} · {t('channelVideo.voice.readings.sentences', { count: check.count })}
                </span>
              </p>
              <p lang="ja" className="text-xs text-foreground/85">
                {check.sentence}
              </p>
              <p lang="ja" className="font-mono text-xs text-muted-foreground">
                {check.reading ? `→ ${check.reading}` : t('channelVideo.voice.readings.noReading')}
              </p>
              {saved ? (
                <div className="flex items-center gap-2 text-xs text-success">
                  <span lang="ja">{t('channelVideo.voice.readings.inDictionary', { reading: saved.reading })}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void guarded(() => deleteNarrationReading(check.term))}
                  >
                    <Trash2 className="size-3.5" />
                    {t('channelVideo.voice.readings.remove')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    lang="ja"
                    className="h-8 max-w-xs text-xs"
                    value={draft}
                    placeholder={t('channelVideo.voice.readings.placeholder')}
                    onChange={(event) => setDrafts((current) => ({ ...current, [check.term]: event.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !draft.trim()}
                    onClick={() =>
                      void guarded(
                        () => saveNarrationReading({ surface: check.term, reading: draft.trim() }),
                        t('channelVideo.voice.readings.saved', { surface: check.term, reading: draft.trim() }),
                      )
                    }
                  >
                    <Save className="size-3.5" />
                    {t('channelVideo.voice.readings.save')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
