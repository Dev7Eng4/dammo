import { BrainCircuit, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchVideoAgentConfig,
  fetchVideoAgentRun,
  fetchVoicevoxStatus,
  VIDEO_AGENT_STREAM_URL,
} from '../api/videoAgent'
import { PageHeader, PageShell } from '../components/layout'
import { NewRunForm } from '../components/video-agent/NewRunForm'
import { RunDetail } from '../components/video-agent/RunDetail'
import { RUN_STATUS_TONE } from '../components/video-agent/runStatus'
import { Button, StatusBadge } from '../components/ui'
import { useAbortableEffect } from '../hooks'
import { cn } from '../lib/cn'
import {
  VIDEO_AGENT_STAGES,
  type VideoAgentConfig,
  type VideoAgentEvent,
  type VideoAgentRun,
  type VideoAgentRunSummary,
  type VoicevoxStatus,
} from '../types/videoAgent'

/** Fields whose change means the cached detail (script, stages) is stale. */
function detailKey(run: Pick<VideoAgentRunSummary, 'status' | 'stagesDone' | 'title' | 'updatedAt'>): string {
  return `${run.status}|${run.stagesDone.join(',')}|${run.title ?? ''}`
}

/** Manual projects share the folder and stream but live on their own screen. */
function isAgentRun(run: Pick<VideoAgentRunSummary, 'mode'>): boolean {
  return run.mode !== 'manual'
}

function upsert(list: VideoAgentRunSummary[], run: VideoAgentRunSummary): VideoAgentRunSummary[] {
  const index = list.findIndex((item) => item.id === run.id)
  if (index === -1) return [run, ...list]
  const next = [...list]
  next[index] = run
  return next
}

function HealthDot({ ok }: { ok: boolean }) {
  return <span className={cn('inline-block size-2 rounded-full', ok ? 'bg-success' : 'bg-danger')} />
}

export function VideoAgentPage() {
  const { t, i18n } = useTranslation('agent')
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<VideoAgentRunSummary[]>([])
  const [detail, setDetail] = useState<VideoAgentRun | null>(null)
  const [config, setConfig] = useState<VideoAgentConfig | null>(null)
  const [voicevox, setVoicevox] = useState<VoicevoxStatus | null>(null)
  const [creating, setCreating] = useState(false)
  const selectedRef = useRef<string | undefined>(selectedId)
  const detailKeyRef = useRef('')

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useAbortableEffect(async (signal) => {
    const [nextConfig, nextVoicevox] = await Promise.all([
      fetchVideoAgentConfig({ signal }),
      fetchVoicevoxStatus({ signal }),
    ])
    setConfig(nextConfig)
    setVoicevox(nextVoicevox)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    const run = await fetchVideoAgentRun(id)
    if (selectedRef.current !== id) return
    detailKeyRef.current = detailKey(run)
    setDetail(run)
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId).catch(() => undefined)
  }, [selectedId, loadDetail])

  // A detail fetched for a previously selected run is never shown for the new selection.
  const shownDetail = detail && detail.id === selectedId ? detail : null

  useEffect(() => {
    const source = new EventSource(VIDEO_AGENT_STREAM_URL)
    source.addEventListener('snapshot', (event) => {
      setRuns((JSON.parse((event as MessageEvent).data) as { items: VideoAgentRunSummary[] }).items.filter(isAgentRun))
    })
    source.addEventListener('run_updated', (event) => {
      const { run } = JSON.parse((event as MessageEvent).data) as Extract<VideoAgentEvent, { type: 'run_updated' }>
      if (!isAgentRun(run)) return
      setRuns((list) => upsert(list, run))
      if (run.id !== selectedRef.current) return
      if (detailKey(run) !== detailKeyRef.current) {
        void loadDetail(run.id)
      } else {
        setDetail((current) => (current && current.id === run.id ? { ...current, ...run } : current))
      }
    })
    source.addEventListener('step_appended', (event) => {
      const { runId, step } = JSON.parse((event as MessageEvent).data) as Extract<
        VideoAgentEvent,
        { type: 'step_appended' }
      >
      if (runId !== selectedRef.current) return
      setDetail((current) =>
        current && current.id === runId && !current.steps.some((item) => item.id === step.id)
          ? { ...current, steps: [...current.steps, step] }
          : current,
      )
    })
    source.addEventListener('run_removed', (event) => {
      const { runId } = JSON.parse((event as MessageEvent).data) as Extract<VideoAgentEvent, { type: 'run_removed' }>
      setRuns((list) => list.filter((item) => item.id !== runId))
    })
    return () => source.close()
  }, [loadDetail])

  function openRun(id: string) {
    setCreating(false)
    navigate(`/video-agent/${id}`)
  }

  return (
    <PageShell>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon={BrainCircuit}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('page.newRun')}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <HealthDot ok={config?.apiKeyConfigured ?? false} />
          {t('health.claude')}: {config?.model ?? '…'}
          {config && !config.apiKeyConfigured ? ` — ${t('health.claudeMissing')}` : ''}
        </span>
        <span className="flex items-center gap-2" title={voicevox?.error}>
          <HealthDot ok={voicevox?.available ?? false} />
          {t('health.voicevox')}: {voicevox?.available ? t('health.voicevoxOk') : t('health.voicevoxDown')} ({voicevox?.url ?? '…'})
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="space-y-2">
          {runs.length === 0 ? (
            <div className="card-surface p-4 text-sm text-muted-foreground">{t('list.empty')}</div>
          ) : (
            runs.map((run) => {
              const progress = VIDEO_AGENT_STAGES.filter((stage) => run.stagesDone.includes(stage)).length
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => openRun(run.id)}
                  className={cn(
                    'card-surface block w-full space-y-1.5 p-3 text-left transition-colors hover:border-primary-400/50',
                    run.id === selectedId && 'border-primary-400/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={RUN_STATUS_TONE[run.status]} label={t(`status.${run.status}`)} withDot />
                    <span className="text-[11px] tabular-nums text-muted-foreground">${run.usage.costUsd.toFixed(2)}</span>
                  </div>
                  <p lang="ja" className="line-clamp-2 text-sm text-foreground">
                    {run.title ?? t('list.untitled')}
                  </p>
                  <div className="flex items-center gap-1">
                    {VIDEO_AGENT_STAGES.map((stage, index) => (
                      <span
                        key={stage}
                        className={cn('h-1 flex-1 rounded-full', index < progress ? 'bg-success' : 'bg-muted')}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {run.channelName} · {new Date(run.createdAt).toLocaleString(i18n.language)}
                  </p>
                </button>
              )
            })
          )}
        </aside>

        <section className="min-w-0">
          {creating ? (
            <NewRunForm voicevox={voicevox} onCreated={(run) => openRun(run.id)} onClose={() => setCreating(false)} />
          ) : shownDetail ? (
            <RunDetail run={shownDetail} onDeleted={() => navigate('/video-agent')} />
          ) : (
            <div className="card-surface p-6 text-center text-sm text-muted-foreground">{t('detail.selectRun')}</div>
          )}
        </section>
      </div>
    </PageShell>
  )
}
