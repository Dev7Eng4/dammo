import { Check, Save, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchRemakeJob,
  fetchRemakePromptSets,
  type RemakeJob,
  type RemakePromptSet,
  type RemakeProvider,
} from '../../api/scriptRemake';
import { fetchPromptSettings } from '../../api/prompts';
import { TEXT_LLM_OPTIONS } from '../../constants/promptForm';
import {
  fetchChannelVideoScript,
  importChannelVideoRemake,
  saveChannelVideoScript,
  startChannelVideoRemake,
  type ChannelVideoScript,
} from '../../api/videoProduction';
import { useAbortableEffect } from '../../hooks';
import { Button, Select, StatusBadge, Textarea, useToast } from '../ui';
import { appLocale } from '../../utils/locale';

const PROVIDERS = TEXT_LLM_OPTIONS;
const POLL_MS = 2000;

interface ChannelVideoScriptStepProps {
  channelId: string;
  videoId: string;
}

/** Remake channels: remake the source transcript with ChatGPT/Gemini/Claude, or type/paste the script. */
export function ChannelVideoScriptStep({ channelId, videoId }: ChannelVideoScriptStepProps) {
  const { t } = useTranslation('manual');
  const { toast } = useToast();
  const [promptSets, setPromptSets] = useState<RemakePromptSet[]>([]);
  const [promptSetId, setPromptSetId] = useState('');
  const [provider, setProvider] = useState<RemakeProvider>('gemini');
  // Start from the remake LLM chosen in Settings → AI tools.
  useAbortableEffect(async (signal) => {
    const { item } = await fetchPromptSettings({ signal });
    setProvider(item.scriptRemakeLlmProvider);
  }, []);
  const [notes, setNotes] = useState('');
  const [script, setScript] = useState<ChannelVideoScript | null>(null);
  const [text, setText] = useState('');
  const [job, setJob] = useState<RemakeJob | null>(null);
  const [busy, setBusy] = useState(false);

  useAbortableEffect(async (signal) => {
    const { items } = await fetchRemakePromptSets('ja', { signal }, channelId);
    setPromptSets(items);
    setPromptSetId((current) => current || items[0]?.id || '');
  }, []);

  useAbortableEffect(
    async (signal) => {
      const next = await fetchChannelVideoScript(channelId, videoId, { signal });
      setScript(next);
      setText(next.text);
    },
    [channelId, videoId],
  );

  const jobId = job?.id ?? script?.remakeJobId;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const load = () =>
      fetchRemakeJob(jobId)
        .then((next) => !cancelled && setJob(next))
        .catch(() => undefined);
    void load();
    if (jobStatus && jobStatus !== 'running') return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, jobStatus]);

  async function guarded(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyScript(next: ChannelVideoScript) {
    setScript(next);
    setText(next.text);
  }

  const remakeRunning = job?.status === 'running';

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('script.remake.title')}</p>
          <p className="text-xs text-muted-foreground">{t('channelVideo.script.remakeHint')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1.5 md:col-span-2">
            <span className="section-label">{t('script.remake.promptSet')}</span>
            {promptSets.length > 0 ? (
              <Select
                value={promptSetId}
                onChange={setPromptSetId}
                options={promptSets.map((set) => ({ value: set.id, label: `${set.name} (${set.language})` }))}
              />
            ) : (
              <p className="text-xs text-danger">{t('script.remake.noPromptSet')}</p>
            )}
          </label>
          <label className="space-y-1.5">
            <span className="section-label">{t('script.remake.provider')}</span>
            <Select
              value={provider}
              onChange={(value) => setProvider(value as RemakeProvider)}
              options={PROVIDERS}
            />
          </label>
        </div>
        <Textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('script.remake.notesPlaceholder')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy || remakeRunning || promptSets.length === 0}
            onClick={() =>
              void guarded(async () => {
                setJob(
                  await startChannelVideoRemake(channelId, videoId, {
                    provider,
                    promptSetId: promptSetId || undefined,
                    notes: notes.trim() || undefined,
                  }),
                );
              })
            }
          >
            <Wand2 className="size-4" />
            {remakeRunning ? t('script.remake.running', { progress: job?.progress ?? '' }) : t('script.remake.start')}
          </Button>
          {job?.status === 'done' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void guarded(async () => applyScript(await importChannelVideoRemake(channelId, videoId, job.id)), t('script.remake.imported'))
              }
            >
              <Check className="size-4" />
              {t('script.remake.use')}
              {job.plannedMinutes ? ` (${job.plannedMinutes} ${t('script.min')})` : ''}
            </Button>
          ) : null}
          {job ? (
            <StatusBadge
              tone={job.status === 'done' ? 'success' : job.status === 'failed' ? 'danger' : 'info'}
              label={t(`script.remake.status.${job.status}`)}
              withDot
            />
          ) : null}
        </div>
        {job?.error ? <p className="text-xs text-danger">{job.error}</p> : null}
        {job ? (
          <details open={job.status === 'running'}>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t('script.remake.logs')} ({job.logs.length})
            </summary>
            <ul className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted p-2 font-mono text-[11px] text-foreground/85">
              {job.logs.map((entry, index) => (
                <li key={index}>
                  {new Date(entry.at).toLocaleTimeString(appLocale())} {entry.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('script.editor.title')}</p>
          <p className="text-xs text-muted-foreground">{t('script.editor.hint')}</p>
          {script?.skillScript ? (
            <p className="mt-1 text-xs text-primary">
              {t('channelVideo.script.fromSkill', { date: script.skillScript.checkedAt.slice(0, 10) })}
            </p>
          ) : null}
        </div>
        <Textarea
          lang="ja"
          rows={16}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="font-mono text-xs leading-6"
          placeholder={'# タイトル\n\n## 1. 章の見出し\n1文ずつ改行して書く。\n\n## 2. 次の章'}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy || !text.trim() || text === script?.text}
            onClick={() =>
              void guarded(async () => applyScript(await saveChannelVideoScript(channelId, videoId, text)), t('script.editor.saved'))
            }
          >
            <Save className="size-4" />
            {t('script.editor.save')}
          </Button>
          {script?.chars ? (
            <span className="text-xs text-muted-foreground">
              {t('channelVideo.script.size', { chars: script.chars })}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
