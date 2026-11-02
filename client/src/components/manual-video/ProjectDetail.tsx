import {
  AlertTriangle,
  Ban,
  Check,
  CircleDot,
  Copy,
  FolderOpen,
  Lock,
  Mic,
  Play,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { videoAgentVideoUrl } from '../../api/videoAgent'
import {
  approveManualScript,
  cancelManualStep,
  deleteManualProject,
  openManualFolder,
  runManualStep,
  generateManualClips,
  removeManualClip,
  type ManualMotionMode,
  type ManualStep,
} from '../../api/manualVideo'
import { cn } from '../../lib/cn'
import type { VideoAgentRun, VideoAgentStage, VoicevoxStatus } from '../../types/videoAgent'
import { RUN_STATUS_TONE } from '../video-agent/runStatus'
import { Button, PageTabs, Select, StatusBadge, Textarea, useToast } from '../ui'
import { ApprovalStep } from './ApprovalStep'
import { ChannelSwitcher } from './ChannelSwitcher'
import { SceneGallery } from './SceneGallery'
import { MotionStep } from './MotionStep'
import { ScriptStep } from './ScriptStep'
import { VoicePreviewButton } from './VoicePreviewButton'
import { VoiceReview } from './VoiceReview'

const SPEED_OPTIONS = ['0.9', '1', '1.1', '1.2']
const MIN_MINUTES = 12
const MAX_MINUTES = 30

type StepId = 'source' | 'script' | 'approval' | 'voice' | 'scenes' | 'motion' | 'video'
/** Tabs; approval has none of its own, it sits at the foot of the script tab. */
const STEP_IDS: readonly StepId[] = ['source', 'script', 'voice', 'scenes', 'motion', 'video']
/** Steps a project may skip; they never hold up the next tab. */
const OPTIONAL_STEPS: readonly StepId[] = ['motion']
type TabId = StepId | 'log'
const STEP_STAGE: Record<StepId, VideoAgentStage> = {
  source: 'source',
  script: 'script',
  approval: 'approval',
  voice: 'voice',
  scenes: 'scenes',
  motion: 'motion',
  video: 'video',
}
/** What a step needs before it can run, by stage. */
/** Voice and images both open once the script is approved; images no longer wait for the voice. */
const REQUIRES: Partial<Record<StepId, StepId[]>> = {
  script: ['source'],
  approval: ['script'],
  voice: ['approval'],
  scenes: ['approval'],
  motion: ['scenes'],
  video: ['voice', 'scenes'],
}

function formatDuration(sec?: number): string {
  if (!sec) return '—'
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

interface StepCardProps {
  index: number
  title: string
  description: string
  state: 'done' | 'running' | 'ready' | 'locked'
  lockedHint?: string
  children?: ReactNode
}

function StepCard({ index, title, description, state, lockedHint, children }: StepCardProps) {
  const { t } = useTranslation('manual')
  const Icon: LucideIcon = state === 'done' ? Check : state === 'running' ? CircleDot : state === 'locked' ? Lock : Play
  return (
    <section
      className={cn(
        'card-surface space-y-3 p-4',
        state === 'done' && 'border-success/30',
        state === 'running' && 'border-info/40',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs',
            state === 'done' && 'border-success/40 bg-success/15 text-success',
            state === 'running' && 'border-info/40 bg-info/15 text-info',
            state === 'ready' && 'border-primary-400/50 text-foreground',
            state === 'locked' && 'border-border text-muted-foreground',
          )}
        >
          <Icon className={cn('size-3.5', state === 'running' && 'animate-pulse')} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {index}. {title}
          </h3>
          <p className="text-xs text-muted-foreground">{state === 'locked' && lockedHint ? lockedHint : description}</p>
        </div>
        <StatusBadge
          tone={state === 'done' ? 'success' : state === 'running' ? 'info' : 'neutral'}
          label={t(`state.${state}`)}
        />
      </header>
      {state === 'locked' ? null : children}
    </section>
  )
}

interface ProjectDetailProps {
  run: VideoAgentRun
  scriptText: string
  motionDefault: ManualMotionMode | 'none'
  voicevox: VoicevoxStatus | null
  onRefreshVoicevox: () => void
  onDeleted: () => void
}

export function ProjectDetail({ run, scriptText, motionDefault, voicevox, onRefreshVoicevox, onDeleted }: ProjectDetailProps) {
  const { t, i18n } = useTranslation(['manual', 'agent'])
  const { toast } = useToast()
  const [urls, setUrls] = useState(run.input.sourceUrls.join('\n'))
  const [speaker, setSpeaker] = useState(String(run.input.voicevoxSpeaker))
  const [speed, setSpeed] = useState(String(run.input.speedScale))
  const [busy, setBusy] = useState(false)
  // Opens on the next step still to do, so the producer lands where the work is.
  const [tab, setTab] = useState<TabId>(() => STEP_IDS.find((id) => !OPTIONAL_STEPS.includes(id) && !run.stagesDone.includes(STEP_STAGE[id === 'script' ? 'approval' : id])) ?? 'video')

  const running = run.status === 'running'
  // Voice (VOICEVOX) and images (Chrome) can run side by side; editing sources/script waits for every step.
  const activeStages: VideoAgentStage[] = run.activeStages ?? (running && run.currentStage ? [run.currentStage] : [])
  const isActive = (step: StepId) => activeStages.includes(STEP_STAGE[step])
  const locked = running || busy
  const stepLocked = (step: StepId) => busy || isActive(step) || (step === 'video' ? running : isActive('video'))
  const done = (step: StepId) => run.stagesDone.includes(STEP_STAGE[step])
  const stateOf = (step: StepId): StepCardProps['state'] => {
    if (isActive(step)) return 'running'
    // The script tab is finished only once the script is approved.
    if (step === 'script') return done('approval') ? 'done' : 'ready'
    if (done(step)) return 'done'
    return (REQUIRES[step] ?? []).every(done) ? 'ready' : 'locked'
  }
  const lockedHint = (step: StepId) => t(`lock.${(REQUIRES[step] ?? []).find((need) => !done(need)) ?? 'source'}`)

  async function act(action: () => Promise<unknown>, success?: string) {
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

  const runStep = (step: ManualStep, body = {}) => act(() => runManualStep(run.id, step, body))
  const folder = run.artifacts.videoPath ? run.artifacts.videoPath.replace(/[\\/][^\\/]+$/, '') : null
  const fit = run.artifacts.narrationFit
  const outsideWindow = fit ? fit.actualMinutes < MIN_MINUTES || fit.actualMinutes > MAX_MINUTES : false
  const speakerOptions = (voicevox?.speakers ?? []).flatMap((s) =>
    s.styles.map((style) => ({ value: String(style.id), label: `${s.name} · ${style.name} (#${style.id})` })),
  )

  async function handleDelete() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    await act(async () => {
      await deleteManualProject(run.id)
      onDeleted()
    })
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('detail.copied')),
      () => toast.error(text),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={RUN_STATUS_TONE[run.status]} label={t(`status.${run.status}`, { ns: 'agent' })} withDot />
            <ChannelSwitcher run={run} disabled={locked || activeStages.length > 0} />
            <span className="text-xs text-muted-foreground">· {new Date(run.createdAt).toLocaleString(i18n.language)}</span>
          </div>
          <h2 lang="ja" className="mt-1.5 text-lg font-semibold break-words text-foreground">
            {run.title ?? t('list.untitled')}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button size="sm" variant="danger" onClick={() => void act(() => cancelManualStep(run.id))}>
              <Ban className="size-4" />
              {t('detail.cancel')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void handleDelete()}>
              <Trash2 className="size-4" />
              {t('detail.delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="card-surface flex flex-wrap items-center gap-2 p-3 text-xs">
        <span className="section-label">{t('detail.storedAt')}</span>
        <code className="min-w-0 flex-1 font-mono break-all text-foreground/90">
          {folder ?? t('detail.storedAtHint', { id: run.id })}
        </code>
        <Button size="sm" variant="secondary" onClick={() => void act(() => openManualFolder(run.id))}>
          <FolderOpen className="size-4" />
          {t('detail.openFolder')}
        </Button>
        {folder ? (
          <Button size="sm" variant="ghost" onClick={() => copy(folder)} aria-label={t('detail.copy')}>
            <Copy className="size-4" />
          </Button>
        ) : null}
      </div>

      {run.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm whitespace-pre-line text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {run.error}
        </div>
      ) : null}

      <PageTabs
        items={[
          ...STEP_IDS.map((id, index) => ({
            id,
            label: `${stateOf(id) === 'done' ? '✓ ' : stateOf(id) === 'running' ? '● ' : ''}${index + 1}. ${t(`step.${id}.title`)}`,
          })),
          { id: 'log', label: `${t('detail.timeline')} (${run.steps.length})` },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as TabId)}
      />

      {tab === 'source' ? (
        <StepCard index={1} title={t('step.source.title')} description={t('step.source.desc')} state={stateOf('source')}>
          <Textarea
            rows={3}
            value={urls}
            disabled={locked}
            onChange={(event) => setUrls(event.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={locked || !urls.trim()}
              onClick={() => void runStep('sources', { urls: urls.split(/\s+/).filter((line) => /youtu\.?be/.test(line)) })}
            >
              {done('source') ? t('step.source.reload') : t('step.source.load')}
            </Button>
          </div>
          {run.artifacts.sources.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {run.artifacts.sources.map((source) => (
                <li key={source.videoId} className="break-all">
                  <a className="text-secondary-400 hover:text-secondary-300" href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span className="ml-2 text-muted-foreground">{t('step.source.chars', { count: source.transcriptChars })}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </StepCard>
      ) : null}

      {tab === 'script' ? (
        <StepCard index={2} title={t('step.script.title')} description={t('step.script.desc')} state={stateOf('script')}>
          <ScriptStep run={run} scriptText={scriptText} disabled={locked} />
          <ApprovalStep
            run={run}
            disabled={locked}
            approved={done('approval')}
            onApprove={() => void act(() => approveManualScript(run.id))}
          />
        </StepCard>
      ) : null}

      {tab === 'voice' ? (
        <StepCard
          index={3}
          title={t('step.voice.title')}
          description={t('step.voice.desc')}
          state={stateOf('voice')}
          lockedHint={lockedHint('voice')}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 md:col-span-2">
              <span className="section-label">{t('form.voice')}</span>
              {voicevox?.available ? (
                <div className="flex items-center gap-2">
                  <Select
                    className="min-w-0 flex-1"
                    options={speakerOptions}
                    value={speaker}
                    onChange={setSpeaker}
                    searchable
                    disabled={stepLocked('voice')}
                  />
                  <VoicePreviewButton
                    speaker={Number(speaker)}
                    speed={Number(speed)}
                    sampleText={run.script?.chapters[0]?.sentences.slice(0, 2).join('')}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-danger">{t('step.voice.unavailable', { url: voicevox?.url ?? '' })}</p>
                  <Button size="sm" variant="secondary" onClick={onRefreshVoicevox}>
                    {t('step.voice.recheck')}
                  </Button>
                </div>
              )}
            </label>
            <label className="space-y-1.5">
              <span className="section-label">{t('form.speed')}</span>
              <Select
                options={SPEED_OPTIONS.map((value) => ({ value, label: `×${value}` }))}
                value={speed}
                onChange={setSpeed}
                disabled={stepLocked('voice')}
              />
            </label>
          </div>
          <Button
            size="sm"
            disabled={stepLocked('voice') || !voicevox?.available}
            onClick={() => void runStep('voice', { voicevoxSpeaker: Number(speaker), speedScale: Number(speed) })}
          >
            <Mic className="size-4" />
            {done('voice') ? t('step.voice.again') : t('step.voice.run')}
          </Button>
          {fit ? (
            <p className={cn('text-xs', outsideWindow ? 'text-warning' : 'text-foreground/90')}>
              {t('step.voice.result', {
                actual: fit.actualMinutes,
                planned: fit.targetMinutes,
                min: MIN_MINUTES,
                max: MAX_MINUTES,
                duration: formatDuration(run.artifacts.audioDurationSec),
              })}
              {outsideWindow ? ` — ${t('step.voice.outside')}` : ''}
            </p>
          ) : null}
          {done('voice') && !isActive('voice') ? (
            <VoiceReview runId={run.id} version={`${run.artifacts.audioDurationSec ?? 0}-${run.input.voicevoxSpeaker}-${run.input.speedScale}`} />
          ) : null}
        </StepCard>
      ) : null}

      {tab === 'scenes' ? (
        <StepCard
          index={4}
          title={t('step.scenes.title')}
          description={t('step.scenes.desc')}
          state={stateOf('scenes')}
          lockedHint={lockedHint('scenes')}
        >
          <Button
            size="sm"
            disabled={stepLocked('scenes')}
            onClick={() => {
              if (done('scenes') && !window.confirm(t('step.scenes.redoConfirm', { count: run.artifacts.sceneCount ?? 0 }))) return
              void runStep('scenes')
            }}
          >
            {done('scenes') ? t('step.scenes.again') : t('step.scenes.run')}
          </Button>
          {run.artifacts.sceneCount ? (
            <p className="text-xs text-foreground/90">
              {t('step.scenes.result', { scenes: run.artifacts.sceneCount, images: run.artifacts.imagesGenerated ?? 0 })}
            </p>
          ) : null}
          {run.artifacts.sceneTimingBasis ? (
            <p className={cn('text-xs', run.artifacts.sceneTimingBasis === 'provisional' ? 'text-warning' : 'text-muted-foreground')}>
              {t(`step.scenes.timing.${run.artifacts.sceneTimingBasis}`)}
            </p>
          ) : null}
          {done('scenes') ? (
            <SceneGallery runId={run.id} reloadKey={run.updatedAt} imagesBusy={isActive('scenes')} disabled={busy} />
          ) : null}
        </StepCard>
      ) : null}

      {tab === 'motion' ? (
        <StepCard
          index={5}
          title={t('step.motion.title')}
          description={t('step.motion.desc')}
          state={stateOf('motion')}
          lockedHint={lockedHint('motion')}
        >
          {done('scenes') ? (
            <MotionStep
              runId={run.id}
              reloadKey={run.updatedAt}
              motionDefault={motionDefault}
              working={isActive('motion')}
              disabled={stepLocked('motion')}
              onGenerate={(mode, indexes) => void act(() => generateManualClips(run.id, mode, indexes))}
              onRemove={(index) => void act(() => removeManualClip(run.id, index))}
            />
          ) : null}
        </StepCard>
      ) : null}

      {tab === 'video' ? (
        <StepCard
          index={6}
          title={t('step.video.title')}
          description={t('step.video.desc')}
          state={stateOf('video')}
          lockedHint={lockedHint('video')}
        >
          <Button size="sm" disabled={stepLocked('video')} onClick={() => void runStep('video')}>
            {done('video') ? t('step.video.again') : t('step.video.run')}
          </Button>
          {run.artifacts.videoPath ? (
            <div className="space-y-2">
              <video className="w-full rounded-lg bg-black" controls preload="metadata" src={videoAgentVideoUrl(run.id)} />
              <p className="font-mono text-xs break-all text-foreground/90">{run.artifacts.videoPath}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(run.artifacts.videoPath!)}>
                  <Copy className="size-4" />
                  {t('detail.copy')}
                </Button>
                <a
                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted"
                  href={videoAgentVideoUrl(run.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('detail.openVideo')}
                </a>
              </div>
            </div>
          ) : null}
        </StepCard>
      ) : null}

      {tab === 'log' ? (
        <ul className="card-surface max-h-[32rem] space-y-1 overflow-auto p-3 text-xs">
          {[...run.steps].reverse().map((step) => (
            <li key={step.id} className={cn('break-words', step.isError ? 'text-danger' : 'text-foreground/85')}>
              <span className="mr-2 tabular-nums text-muted-foreground">{new Date(step.at).toLocaleTimeString(i18n.language)}</span>
              {step.toolName ? <span className="mr-1 uppercase text-muted-foreground">{step.toolName}</span> : null}
              {step.kind === 'tool_call' ? null : step.title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
