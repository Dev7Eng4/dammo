import {
  AlertTriangle,
  Ban,
  Bot,
  Brain,
  Check,
  CircleDot,
  Play,
  RotateCcw,
  Terminal,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  approveVideoAgentRun,
  cancelVideoAgentRun,
  deleteVideoAgentRun,
  rejectVideoAgentRun,
  resumeVideoAgentRun,
  videoAgentVideoUrl,
} from '../../api/videoAgent'
import { cn } from '../../lib/cn'
import {
  VIDEO_AGENT_STAGES,
  type VideoAgentRun,
  type VideoAgentFreshness,
  type VideoAgentScript,
  type VideoAgentScriptReview,
  type VideoAgentStep,
  type VideoAgentStepKind,
} from '../../types/videoAgent'
import { Button, PageTabs, StatusBadge, Textarea, useToast } from '../ui'
import { RUN_STATUS_TONE } from './runStatus'

/** Mirrors the server-side gate in similarity.ts. */
const SIMILARITY_LIMITS = { gram8: 5, gram15: 0.5 }

const STEP_ICON: Record<VideoAgentStepKind, LucideIcon> = {
  thinking: Brain,
  message: Bot,
  tool_call: Wrench,
  tool_result: Check,
  system: Terminal,
  error: AlertTriangle,
}

function formatDuration(sec?: number): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value)
}

function StageRail({ run }: { run: VideoAgentRun }) {
  const { t } = useTranslation('agent')
  const live = run.status === 'running' || run.status === 'awaiting_approval'
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {VIDEO_AGENT_STAGES.map((stage, index) => {
        const done = run.stagesDone.includes(stage)
        const current = live && run.currentStage === stage && !done
        return (
          <li
            key={stage}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
              done && 'border-success/30 bg-success/10 text-success',
              current && 'border-info/40 bg-info/10 text-info',
              !done && !current && 'border-border text-muted-foreground',
            )}
          >
            {done ? (
              <Check className="size-3.5 shrink-0" />
            ) : current ? (
              <CircleDot className="size-3.5 shrink-0 animate-pulse" />
            ) : (
              <span className="w-3.5 shrink-0 text-center tabular-nums">{index + 1}</span>
            )}
            <span className="truncate">{t(`stage.${stage}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface px-3 py-2.5">
      <p className="section-label">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground" title={hint}>
        {value}
      </p>
    </div>
  )
}

function SimilarityList({ script }: { script: VideoAgentScript }) {
  const { t } = useTranslation('agent')
  return (
    <ul className="space-y-1 text-xs">
      {script.similarity.map((item) => {
        const pass = item.gram8 <= SIMILARITY_LIMITS.gram8 && item.gram15 <= SIMILARITY_LIMITS.gram15
        return (
          <li key={item.sourceVideoId} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-muted-foreground">{item.sourceVideoId}</span>
            <span className="tabular-nums">8g {item.gram8}%</span>
            <span className="tabular-nums">15g {item.gram15}%</span>
            <StatusBadge tone={pass ? 'success' : 'danger'} label={pass ? t('approval.pass') : t('approval.fail')} />
          </li>
        )
      })}
    </ul>
  )
}

function ReviewLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

/** The editor pass: structural copying per source, repeated ideas, chapter hand-offs, overall arc. */
function ReviewPanel({ review }: { review: VideoAgentScriptReview }) {
  const { t } = useTranslation('agent')
  const weak = review.transitions.filter((item) => !item.smooth)
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <p className="section-label">{t('review.title')}</p>
        <StatusBadge tone={review.pass ? 'success' : 'warning'} label={review.pass ? t('approval.pass') : t('review.needsWork')} />
      </div>
      <ul className="space-y-1.5 text-xs text-foreground/90">
        {review.sources.map((source) => (
          <ReviewLine key={source.sourceIndex} ok={source.pass}>
            {t('review.source', { index: source.sourceIndex, percent: source.sharedStructurePercent })} — {source.reason}
            {source.reusedExamples.length > 0 ? ` (${t('review.reused')}: ${source.reusedExamples.join(' / ')})` : ''}
          </ReviewLine>
        ))}
        {review.repetitions.length === 0 ? (
          <ReviewLine ok>{t('review.noRepetition')}</ReviewLine>
        ) : (
          review.repetitions.map((item, index) => (
            <ReviewLine key={`rep-${index}`} ok={false}>
              {t('review.repetition', { a: item.chapterA, b: item.chapterB })}: {item.what}
            </ReviewLine>
          ))
        )}
        {weak.length === 0 ? (
          <ReviewLine ok>{t('review.smooth', { count: review.transitions.length })}</ReviewLine>
        ) : (
          weak.map((item) => (
            <ReviewLine key={`tr-${item.fromChapter}`} ok={false}>
              {t('review.weak', { from: item.fromChapter, to: item.fromChapter + 1 })}: {item.note}
            </ReviewLine>
          ))
        )}
        <ReviewLine ok={review.arc.builds}>
          {review.arc.builds ? t('review.arcOk') : t('review.arcWeak')} — {review.arc.note}
        </ReviewLine>
        {(review.chapters ?? [])
          .filter((item) => item.mode === 'explanation' || !item.hasSpecificDetail || !item.formFollowed)
          .map((item) => (
            <ReviewLine key={`ch-${item.chapter}`} ok={false}>
              {t('review.chapter', { n: item.chapter })}:{' '}
              {[
                item.mode === 'explanation' ? t('review.explanation') : '',
                item.hasSpecificDetail ? '' : t('review.generic'),
                item.formFollowed ? '' : t('review.formBroken'),
              ]
                .filter(Boolean)
                .join(', ')}
              {item.note ? ` — ${item.note}` : ''}
            </ReviewLine>
          ))}
        {(review.originality ?? []).map((item, index) => (
          <ReviewLine key={`orig-${index}`} ok={item.inScript && !item.inSources}>
            {t('review.original')}: {item.element}
            {!item.inScript ? ` — ${t('review.notWritten')}` : item.inSources ? ` — ${t('review.inSource')}` : ''}
          </ReviewLine>
        ))}
        {review.thread ? (
          <ReviewLine ok={review.thread.inEveryChapter && review.thread.meaningShifts}>
            {t('review.thread')} — {review.thread.note}
          </ReviewLine>
        ) : null}
      </ul>
    </div>
  )
}

function FreshnessPanel({ freshness }: { freshness: VideoAgentFreshness }) {
  const { t } = useTranslation('agent')
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <p className="section-label">{t('freshness.title', { count: freshness.compared })}</p>
        <StatusBadge tone={freshness.pass ? 'success' : 'warning'} label={freshness.pass ? t('approval.pass') : t('review.needsWork')} />
      </div>
      {freshness.issues.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('freshness.clean')}</p>
      ) : (
        <ul className="space-y-1.5 text-xs text-foreground/90">
          {freshness.issues.map((issue, index) => (
            <ReviewLine key={index} ok={false}>
              <span className="mr-1 text-[11px] uppercase text-muted-foreground">{t(`freshness.kind.${issue.kind}`)}</span>
              {issue.message}
            </ReviewLine>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScriptView({ script }: { script: VideoAgentScript }) {
  const { t } = useTranslation('agent')
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{script.outline.title}</h3>
        <p className="text-xs text-muted-foreground">
          {t('detail.chars', { count: script.totalChars })} · {t('detail.minutes', { value: script.estimatedMinutes })}
        </p>
        {script.plannedMinutes ? (
          <p className="text-sm text-foreground/90">
            <span className="text-muted-foreground">{t('detail.plannedLength')}: </span>
            {t('detail.minutes', { value: script.plannedMinutes })}
            {script.lengthReason ? ` — ${script.lengthReason}` : ''}
          </p>
        ) : null}
        <p className="text-sm text-foreground/90">
          <span className="text-muted-foreground">{t('detail.angle')}: </span>
          {script.outline.angle}
        </p>
        <p className="text-sm text-foreground/90">
          <span className="text-muted-foreground">{t('detail.hook')}: </span>
          {script.outline.hook}
        </p>
      </div>
      <SimilarityList script={script} />
      {script.review ? <ReviewPanel review={script.review} /> : null}
      {script.freshness ? <FreshnessPanel freshness={script.freshness} /> : null}
      <div className="space-y-4">
        {script.chapters.map((chapter, index) => (
          <section key={index} className="space-y-1.5">
            <h4 className="text-sm font-semibold text-foreground">
              {index + 1}. {chapter.heading}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                {t('detail.chars', { count: chapter.sentences.join('').length })}
              </span>
            </h4>
            <p lang="ja" className="text-sm leading-7 whitespace-pre-line text-foreground/90">
              {chapter.sentences.join('\n')}
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}

function ApprovalPanel({ run }: { run: VideoAgentRun }) {
  const { t } = useTranslation('agent')
  const { toast } = useToast()
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  async function answer(approved: boolean) {
    if (!approved && !feedback.trim()) {
      toast.error(t('approval.rejectNeedsFeedback'))
      return
    }
    setBusy(true)
    try {
      if (approved) await approveVideoAgentRun(run.id, feedback.trim() || undefined)
      else await rejectVideoAgentRun(run.id, feedback.trim())
      setFeedback('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-semibold text-warning">{t('approval.title')}</p>
      {run.pendingApproval?.summary ? (
        <p className="text-sm whitespace-pre-line text-foreground/90">{run.pendingApproval.summary}</p>
      ) : null}
      {run.script?.review ? <ReviewPanel review={run.script.review} /> : null}
      {run.script?.freshness ? <FreshnessPanel freshness={run.script.freshness} /> : null}
      <label className="block space-y-1.5">
        <span className="section-label">{t('approval.feedback')}</span>
        <Textarea
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t('approval.feedbackPlaceholder')}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void answer(true)} disabled={busy}>
          <Check className="size-4" />
          {t('approval.approve')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void answer(false)} disabled={busy}>
          <RotateCcw className="size-4" />
          {t('approval.reject')}
        </Button>
      </div>
    </div>
  )
}

function StepRow({ step }: { step: VideoAgentStep }) {
  const { t, i18n } = useTranslation('agent')
  const Icon = STEP_ICON[step.kind]
  const isError = step.isError || step.kind === 'error'
  const body = (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          isError ? 'text-danger' : step.kind === 'thinking' ? 'text-info' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm break-words', isError ? 'text-danger' : 'text-foreground')}>
          <span className="mr-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {step.toolName ?? t(`step.${step.kind}`)}
          </span>
          {step.kind === 'tool_call' ? null : step.title}
        </p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s · ` : ''}
        {new Date(step.at).toLocaleTimeString(i18n.language)}
      </span>
    </div>
  )

  if (!step.detail) return <li className="px-3 py-2">{body}</li>
  return (
    <li className="px-3 py-2">
      <details className="group">
        <summary className="cursor-pointer list-none">{body}</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap text-foreground/85">
          {step.detail}
        </pre>
      </details>
    </li>
  )
}

interface RunDetailProps {
  run: VideoAgentRun
  onDeleted: () => void
}

export function RunDetail({ run, onDeleted }: RunDetailProps) {
  const { t, i18n } = useTranslation('agent')
  const { toast } = useToast()
  const [tab, setTab] = useState('timeline')

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    await act(async () => {
      await deleteVideoAgentRun(run.id)
      onDeleted()
    })
  }

  const live = run.status === 'running' || run.status === 'queued' || run.status === 'awaiting_approval'
  const canResume = run.status === 'interrupted' || run.status === 'failed' || run.status === 'cancelled'
  const steps = [...run.steps].reverse()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={RUN_STATUS_TONE[run.status]} label={t(`status.${run.status}`)} withDot />
            <span className="text-xs text-muted-foreground">
              {run.channelName} · {run.model} · {new Date(run.createdAt).toLocaleString(i18n.language)}
            </span>
          </div>
          <h2 lang="ja" className="mt-1.5 text-lg font-semibold break-words text-foreground">
            {run.title ?? t('list.untitled')}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {live ? (
            <Button size="sm" variant="danger" onClick={() => void act(() => cancelVideoAgentRun(run.id))}>
              <Ban className="size-4" />
              {t('detail.cancel')}
            </Button>
          ) : null}
          {canResume ? (
            <Button size="sm" variant="secondary" onClick={() => void act(() => resumeVideoAgentRun(run.id))}>
              <Play className="size-4" />
              {t('detail.resume')}
            </Button>
          ) : null}
          {!live ? (
            <Button size="sm" variant="ghost" onClick={() => void handleDelete()}>
              <Trash2 className="size-4" />
              {t('detail.delete')}
            </Button>
          ) : null}
        </div>
      </div>

      <StageRail run={run} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label={t('detail.turns')} value={String(run.turns)} />
        <Metric label={t('detail.cost')} value={`$${run.usage.costUsd.toFixed(2)}`} hint={t('detail.costHint')} />
        <Metric
          label={t('detail.tokens')}
          value={`${formatTokens(run.usage.inputTokens + run.usage.cacheReadTokens + run.usage.cacheWriteTokens)} / ${formatTokens(run.usage.outputTokens)}`}
        />
        <Metric
          label={t('detail.audio')}
          value={
            run.artifacts.narrationFit
              ? `${formatDuration(run.artifacts.audioDurationSec)} / ${run.artifacts.narrationFit.targetMinutes}:00 (${run.artifacts.narrationFit.deviationPercent > 0 ? '+' : ''}${run.artifacts.narrationFit.deviationPercent}%)`
              : formatDuration(run.artifacts.audioDurationSec)
          }
        />
        <Metric label={t('detail.scenes')} value={run.artifacts.sceneCount ? String(run.artifacts.sceneCount) : '—'} />
      </div>

      {run.error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm whitespace-pre-line text-danger">
          {run.error}
        </div>
      ) : null}

      {run.status === 'awaiting_approval' ? <ApprovalPanel run={run} /> : null}

      <PageTabs
        items={[
          { id: 'timeline', label: `${t('detail.timeline')} (${run.steps.length})` },
          { id: 'script', label: t('detail.script') },
          { id: 'result', label: t('detail.result') },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {tab === 'timeline' ? (
        <ul className="card-surface divide-y divide-border">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      ) : null}

      {tab === 'script' ? (
        <div className="card-surface p-4">
          {run.script ? <ScriptView script={run.script} /> : <p className="text-sm text-muted-foreground">{t('detail.noScript')}</p>}
        </div>
      ) : null}

      {tab === 'result' ? (
        <div className="card-surface space-y-4 p-4">
          {run.artifacts.videoPath ? (
            <video className="w-full rounded-lg bg-black" controls preload="metadata" src={videoAgentVideoUrl(run.id)} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('detail.noVideo')}</p>
          )}
          {run.finalSummary ? (
            <div className="space-y-1">
              <p className="section-label">{t('detail.finalSummary')}</p>
              <p className="text-sm whitespace-pre-line text-foreground/90">{run.finalSummary}</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <p className="section-label">{t('detail.sources')}</p>
            <ul className="space-y-1 text-sm">
              {run.input.sourceUrls.map((url) => {
                const info = run.artifacts.sources.find((source) => source.url === url)
                return (
                  <li key={url} className="break-all">
                    <a className="text-secondary-400 hover:text-secondary-300" href={url} target="_blank" rel="noreferrer">
                      {info?.title ?? url}
                    </a>
                    {info ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {t('detail.chars', { count: info.transcriptChars })}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
          {run.artifacts.videoPath ? (
            <div className="space-y-1">
              <p className="section-label">{t('detail.files')}</p>
              <p className="font-mono text-xs break-all text-muted-foreground">{run.artifacts.videoPath}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
