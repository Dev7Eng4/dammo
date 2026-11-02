import { Check, Save, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { importManualRemake, saveManualScript, startManualRemake } from '../../api/manualVideo'
import {
  fetchRemakeJob,
  fetchRemakePromptSets,
  type RemakeJob,
  type RemakeProvider,
  type RemakePromptSet,
} from '../../api/scriptRemake'
import { useAbortableEffect } from '../../hooks'
import type { VideoAgentRun } from '../../types/videoAgent'
import { Button, Select, StatusBadge, Textarea, useToast } from '../ui'
import { ScriptSummary } from './ScriptSummary'

const PROVIDERS: RemakeProvider[] = ['gpt', 'gemini']
const POLL_MS = 2000

interface ScriptStepProps {
  run: VideoAgentRun
  scriptText: string
  disabled: boolean
}

/** Two ways to get a script: let ChatGPT/Gemini remake it from the sources, or type/paste it. */
export function ScriptStep({ run, scriptText, disabled }: ScriptStepProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [promptSets, setPromptSets] = useState<RemakePromptSet[]>([])
  const [promptSetId, setPromptSetId] = useState('')
  const [provider, setProvider] = useState<RemakeProvider>('gpt')
  const [notes, setNotes] = useState('')
  const [job, setJob] = useState<RemakeJob | null>(null)
  const [busy, setBusy] = useState(false)
  // The editor is seeded from the saved script and re-seeded whenever a new script is saved elsewhere.
  const [draft, setDraft] = useState({ key: run.script?.updatedAt ?? '', text: scriptText })
  const savedKey = run.script?.updatedAt ?? ''
  const text = draft.key === savedKey ? draft.text : scriptText
  const sourcesReady = run.stagesDone.includes('source')

  useAbortableEffect(async (signal) => {
    const { items } = await fetchRemakePromptSets('ja', { signal })
    setPromptSets(items)
    setPromptSetId((current) => current || items[0]?.id || '')
  }, [])

  const jobId = job?.id ?? run.remakeJobId
  const jobStatus = job?.status
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const load = () =>
      fetchRemakeJob(jobId)
        .then((next) => !cancelled && setJob(next))
        .catch(() => undefined)
    void load()
    if (jobStatus && jobStatus !== 'running') return
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [jobId, jobStatus])

  async function guarded(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remakeRunning = job?.status === 'running'
  const script = run.script

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('script.remake.title')}</p>
          <p className="text-xs text-muted-foreground">{t('script.remake.hint')}</p>
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
              options={PROVIDERS.map((value) => ({ value, label: value === 'gpt' ? 'ChatGPT' : 'Gemini' }))}
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
            disabled={disabled || busy || remakeRunning || !sourcesReady || promptSets.length === 0}
            onClick={() =>
              void guarded(async () => {
                setJob(await startManualRemake(run.id, { provider, promptSetId: promptSetId || undefined, notes: notes.trim() || undefined }))
              })
            }
          >
            <Wand2 className="size-4" />
            {remakeRunning ? t('script.remake.running', { progress: job?.progress ?? '' }) : t('script.remake.start')}
          </Button>
          {!sourcesReady ? <span className="text-xs text-muted-foreground">{t('script.remake.needSources')}</span> : null}
          {job?.status === 'done' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => void guarded(() => importManualRemake(run.id, job.id), t('script.remake.imported'))}
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
                  {new Date(entry.at).toLocaleTimeString()} {entry.message}
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
        </div>
        <Textarea
          lang="ja"
          rows={16}
          value={text}
          disabled={disabled}
          onChange={(event) => setDraft({ key: savedKey, text: event.target.value })}
          className="font-mono text-xs leading-6"
          placeholder={'# タイトル\n\n## 1. 章の見出し\n1文ずつ改行して書く。\n\n## 2. 次の章'}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={disabled || busy || !text.trim()}
            onClick={() => void guarded(() => saveManualScript(run.id, text), t('script.editor.saved'))}
          >
            <Save className="size-4" />
            {t('script.editor.save')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('script.editor.saveNote')}</span>
        </div>
      </div>

      {script ? <ScriptSummary script={script} /> : null}
    </div>
  )
}
