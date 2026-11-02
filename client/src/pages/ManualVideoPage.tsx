import { ListChecks, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchManualProject, type ManualProjectDetail } from '../api/manualVideo'
import { fetchVoicevoxStatus, VIDEO_AGENT_STREAM_URL } from '../api/videoAgent'
import { PageHeader, PageShell } from '../components/layout'
import { NewProjectForm } from '../components/manual-video/NewProjectForm'
import { ProjectDetail } from '../components/manual-video/ProjectDetail'
import { VideoLibrary } from '../components/manual-video/VideoLibrary'
import { Button, PageTabs, StatusBadge } from '../components/ui'
import { RUN_STATUS_TONE } from '../components/video-agent/runStatus'
import { useAbortableEffect } from '../hooks'
import { cn } from '../lib/cn'
import {
  VIDEO_AGENT_STAGES,
  type VideoAgentEvent,
  type VideoAgentRunSummary,
  type VoicevoxStatus,
} from '../types/videoAgent'

type Tab = 'projects' | 'library'

function upsert(list: VideoAgentRunSummary[], run: VideoAgentRunSummary): VideoAgentRunSummary[] {
  const index = list.findIndex((item) => item.id === run.id)
  if (index === -1) return [run, ...list]
  const next = [...list]
  next[index] = run
  return next
}

const isManual = (run: Pick<VideoAgentRunSummary, 'mode'>) => run.mode === 'manual'

export function ManualVideoPage() {
  const { t, i18n } = useTranslation(['manual', 'agent'])
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('projects')
  const [projects, setProjects] = useState<VideoAgentRunSummary[]>([])
  const [detail, setDetail] = useState<ManualProjectDetail | null>(null)
  const [voicevox, setVoicevox] = useState<VoicevoxStatus | null>(null)
  const [creating, setCreating] = useState(false)
  const [libraryKey, setLibraryKey] = useState(0)
  const selectedRef = useRef<string | undefined>(selectedId)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const refreshVoicevox = useCallback(async () => {
    setVoicevox(await fetchVoicevoxStatus())
  }, [])

  // VOICEVOX is often started after this page is opened, so keep checking until it answers.
  const voicevoxUp = voicevox?.available === true
  useAbortableEffect(async (signal) => {
    setVoicevox(await fetchVoicevoxStatus({ signal }))
  }, [])
  useEffect(() => {
    if (voicevoxUp) return
    const timer = window.setInterval(() => void refreshVoicevox().catch(() => undefined), 10_000)
    return () => window.clearInterval(timer)
  }, [voicevoxUp, refreshVoicevox])

  const loadDetail = useCallback(async (id: string) => {
    const next = await fetchManualProject(id)
    if (selectedRef.current === id) setDetail(next)
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId).catch(() => undefined)
  }, [selectedId, loadDetail])

  useEffect(() => {
    const source = new EventSource(VIDEO_AGENT_STREAM_URL)
    source.addEventListener('snapshot', (event) => {
      const { items } = JSON.parse((event as MessageEvent).data) as { items: VideoAgentRunSummary[] }
      setProjects(items.filter(isManual))
    })
    source.addEventListener('run_updated', (event) => {
      const { run } = JSON.parse((event as MessageEvent).data) as Extract<VideoAgentEvent, { type: 'run_updated' }>
      if (!isManual(run)) return
      setProjects((list) => upsert(list, run))
      setLibraryKey((key) => key + 1)
      if (run.id === selectedRef.current) void loadDetail(run.id).catch(() => undefined)
    })
    source.addEventListener('step_appended', (event) => {
      const { runId, step } = JSON.parse((event as MessageEvent).data) as Extract<VideoAgentEvent, { type: 'step_appended' }>
      if (runId !== selectedRef.current) return
      setDetail((current) =>
        current && current.run.id === runId && !current.run.steps.some((item) => item.id === step.id)
          ? { ...current, run: { ...current.run, steps: [...current.run.steps, step] } }
          : current,
      )
    })
    source.addEventListener('run_removed', (event) => {
      const { runId } = JSON.parse((event as MessageEvent).data) as Extract<VideoAgentEvent, { type: 'run_removed' }>
      setProjects((list) => list.filter((item) => item.id !== runId))
      setLibraryKey((key) => key + 1)
    })
    return () => source.close()
  }, [loadDetail])

  function openProject(id: string) {
    setCreating(false)
    setTab('projects')
    navigate(`/manual-video/${id}`)
  }

  const shown = detail && detail.run.id === selectedId ? detail : null

  return (
    <PageShell>
      <PageHeader
        title={t('manual:page.title')}
        subtitle={t('manual:page.subtitle')}
        icon={ListChecks}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setTab('projects')
              setCreating(true)
            }}
          >
            <Plus className="size-4" />
            {t('manual:page.newProject')}
          </Button>
        }
      />

      <PageTabs
        items={[
          { id: 'projects', label: `${t('manual:tabs.projects')} (${projects.length})` },
          { id: 'library', label: t('manual:tabs.library') },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
      />

      {tab === 'library' ? (
        <VideoLibrary reloadKey={libraryKey} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="space-y-2">
            {projects.length === 0 ? (
              <div className="card-surface p-4 text-sm text-muted-foreground">{t('manual:list.empty')}</div>
            ) : (
              projects.map((project) => {
                const progress = VIDEO_AGENT_STAGES.filter((stage) => project.stagesDone.includes(stage)).length
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    className={cn(
                      'card-surface block w-full space-y-1.5 p-3 text-left transition-colors hover:border-primary-400/50',
                      project.id === selectedId && !creating && 'border-primary-400/70',
                    )}
                  >
                    <StatusBadge
                      tone={RUN_STATUS_TONE[project.status]}
                      label={t(`agent:status.${project.status}`)}
                      withDot
                    />
                    <p lang="ja" className="line-clamp-2 text-sm text-foreground">
                      {project.title ?? t('manual:list.untitled')}
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
                      {project.channelName} · {new Date(project.createdAt).toLocaleString(i18n.language)}
                    </p>
                  </button>
                )
              })
            )}
          </aside>

          <section className="min-w-0">
            {creating ? (
              <NewProjectForm voicevox={voicevox} onCreated={(run) => openProject(run.id)} onClose={() => setCreating(false)} />
            ) : shown ? (
              <ProjectDetail
                key={shown.run.id}
                run={shown.run}
                scriptText={shown.scriptText}
                motionDefault={shown.motionDefault ?? 'none'}
                voicevox={voicevox}
                onRefreshVoicevox={() => void refreshVoicevox().catch(() => undefined)}
                onDeleted={() => navigate('/manual-video')}
              />
            ) : (
              <div className="card-surface p-6 text-center text-sm text-muted-foreground">{t('manual:detail.select')}</div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  )
}
