import { ListChecks, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchManualProject, type ManualProjectDetail } from '../api/manualVideo'
import { fetchVoicevoxStatus, VIDEO_AGENT_STREAM_URL } from '../api/videoAgent'
import { fetchProductionVideos, startPreparingProductionVideo } from '../api/videoProduction'
import { fetchYoutubeChannels } from '../api/youtubeChannels'
import { PageHeader, PageShell } from '../components/layout'
import { ChannelVideoDetail } from '../components/manual-video/ChannelVideoDetail'
import { ChannelVideoThumb } from '../components/manual-video/ChannelVideoThumb'
import { NewProjectForm } from '../components/manual-video/NewProjectForm'
import { ProjectDetail } from '../components/manual-video/ProjectDetail'
import { Button, SearchInput, Select, StatusBadge, useToast } from '../components/ui'
import type { ProductionVideoPatch } from '../components/video-production/useProductionVideoWorkspace'
import { RUN_STATUS_TONE } from '../components/video-agent/runStatus'
import { useAbortableEffect } from '../hooks'
import { cn } from '../lib/cn'
import {
  VIDEO_AGENT_STAGES,
  type VideoAgentEvent,
  type VideoAgentRunSummary,
  type VoicevoxStatus,
} from '../types/videoAgent'
import {
  productionVideoKey,
  type ProductionVideoStatus,
  type ProductionVideoListItem,
} from '../types/videoProductionScenes'

function upsert(list: VideoAgentRunSummary[], run: VideoAgentRunSummary): VideoAgentRunSummary[] {
  const index = list.findIndex((item) => item.id === run.id)
  if (index === -1) return [run, ...list]
  const next = [...list]
  next[index] = run
  return next
}

const isManual = (run: Pick<VideoAgentRunSummary, 'mode'>) => run.mode === 'manual'

const VIDEO_STATUS_TONE = { Created: 'success', Prepared: 'warning', Preparing: 'info' } as const satisfies Record<
  ProductionVideoStatus,
  string
>

/**
 * Sidebar group: a YouTube channel id (its projects plus its prepared/created videos), or this value for
 * projects that belong to no existing channel (no channel set, or the channel was deleted).
 */
const NO_GROUP = 'none'

export function ManualVideoPage() {
  const { t, i18n } = useTranslation(['manual', 'agent'])
  const { id: selectedId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<VideoAgentRunSummary[]>([])
  const [detail, setDetail] = useState<ManualProjectDetail | null>(null)
  const [voicevox, setVoicevox] = useState<VoicevoxStatus | null>(null)
  // Landing on the page without a project in the URL goes straight to a new project.
  const [creating, setCreating] = useState(() => !selectedId)
  const [libraryKey, setLibraryKey] = useState(0)
  // Links from a channel page arrive with ?channelId= so the sidebar starts on that channel.
  const [source, setSource] = useState<string>(() => searchParams.get('channelId') || NO_GROUP)
  /** Ids of channels that still exist; null until loaded. */
  const [channelIds, setChannelIds] = useState<Set<string> | null>(null)
  const [channelVideos, setChannelVideos] = useState<ProductionVideoListItem[] | null>(null)
  const [openedVideoKey, setOpenedVideoKey] = useState<string | null>(null)
  /** Key of a skill-script video whose folder is being created before its tabs open. */
  const [startingKey, setStartingKey] = useState<string | null>(null)
  /** Filters the channel's video list by title or videoId. */
  const [videoQuery, setVideoQuery] = useState('')
  const { toast } = useToast()
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

  useAbortableEffect(
    async (signal) => {
      setChannelVideos(await fetchProductionVideos({ signal }))
    },
    [libraryKey],
  )

  useAbortableEffect(async (signal) => {
    const res = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal })
    setChannelIds(new Set(res.items.map((channel) => channel.id)))
  }, [])

  const patchChannelVideo = useCallback((channelId: string, videoId: string, patch: ProductionVideoPatch) => {
    setChannelVideos((current) =>
      (current ?? []).map((video) =>
        video.channelId === channelId && video.videoId === videoId ? { ...video, ...patch } : video,
      ),
    )
  }, [])

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
    setOpenedVideoKey(null)
    navigate(`/manual-video/${id}`)
  }

  /**
   * Switching the group starts the right pane over with a New project form for the newly picked
   * channel (blank for "No group"); the open project or channel video belongs to the old group.
   */
  function changeSource(next: string) {
    if (next === source) return
    setSource(next)
    setOpenedVideoKey(null)
    setCreating(true)
    if (selectedId) navigate('/manual-video')
  }

  async function openChannelVideo(video: ProductionVideoListItem) {
    const key = productionVideoKey(video)
    if (video.status === 'Preparing' && !video.videoFolderPath) {
      // A skill script with no folder yet: create it (script, source transcript) so every tab works.
      if (startingKey) return
      setStartingKey(key)
      try {
        await startPreparingProductionVideo(video.channelId, video.videoId)
        setChannelVideos(await fetchProductionVideos())
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        return
      } finally {
        setStartingKey(null)
      }
    }
    setCreating(false)
    setSource(video.channelId)
    setOpenedVideoKey(key)
    if (selectedId) navigate('/manual-video')
  }

  const shown = detail && detail.run.id === selectedId ? detail : null
  const openedVideo = (channelVideos ?? []).find((video) => productionVideoKey(video) === openedVideoKey) ?? null

  const inChannel = useCallback(
    (channelId: string | undefined): channelId is string =>
      Boolean(channelId) && (channelIds === null || channelIds.has(channelId as string)),
    [channelIds],
  )

  // Channels that have projects or prepared/created videos, for the sidebar group select.
  const sourceChannels = useMemo(() => {
    const map = new Map<string, { name: string; projects: number; videos: number }>()
    const entry = (id: string, name: string) => {
      const existing = map.get(id) ?? { name, projects: 0, videos: 0 }
      map.set(id, existing)
      return existing
    }
    for (const project of projects) {
      if (inChannel(project.input.channelId)) entry(project.input.channelId, project.channelName).projects += 1
    }
    for (const video of channelVideos ?? []) {
      if (inChannel(video.channelId)) entry(video.channelId, video.channelName).videos += 1
    }
    return [...map.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [projects, channelVideos, inChannel])

  const ungrouped = projects.filter((project) => !inChannel(project.input.channelId))
  const sourceOptions = [
    { value: NO_GROUP, label: `${t('manual:source.none')} (${ungrouped.length})` },
    ...sourceChannels.map((channel) => ({
      value: channel.id,
      label: `${channel.name} (${channel.projects + channel.videos})`,
    })),
  ]
  const listedProjects =
    source === NO_GROUP ? ungrouped : projects.filter((project) => project.input.channelId === source)
  const channelListVideos =
    source === NO_GROUP ? [] : (channelVideos ?? []).filter((video) => video.channelId === source)
  const videoNeedle = videoQuery.trim().toLowerCase()
  const listedVideos = videoNeedle
    ? channelListVideos.filter(
        (video) =>
          (video.title ?? '').toLowerCase().includes(videoNeedle) || video.videoId.toLowerCase().includes(videoNeedle),
      )
    : channelListVideos

  return (
    <PageShell>
      <PageHeader
        title={t('manual:page.title')}
        subtitle={t('manual:page.subtitle')}
        icon={ListChecks}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('manual:page.newProject')}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="space-y-2">
          <Select
            options={sourceOptions}
            value={source}
            onChange={(value) => changeSource(value || NO_GROUP)}
            searchable
          />
          {source !== NO_GROUP ? (
            <p className="section-label pt-1">{t('manual:source.channelProjects')}</p>
          ) : null}
          {listedProjects.length === 0 ? (
            <div className="card-surface p-4 text-sm text-muted-foreground">{t('manual:list.empty')}</div>
          ) : (
            listedProjects.map((project) => {
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
          {source !== NO_GROUP ? (
            <>
              <p className="section-label pt-2">
                {t('manual:source.channelVideos')} (
                {videoNeedle ? `${listedVideos.length}/${channelListVideos.length}` : channelListVideos.length})
              </p>
              {channelListVideos.length > 0 ? (
                <SearchInput
                  value={videoQuery}
                  onChange={(event) => setVideoQuery(event.target.value)}
                  placeholder={t('manual:channelVideo.search')}
                  className="h-9"
                />
              ) : null}
              {listedVideos.length === 0 ? (
                <div className="card-surface p-4 text-sm text-muted-foreground">
                  {videoNeedle ? t('manual:channelVideo.noMatch') : t('manual:channelVideo.empty')}
                </div>
              ) : (
                listedVideos.map((video) => {
                  const key = productionVideoKey(video)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void openChannelVideo(video)}
                      disabled={startingKey === key}
                      className={cn(
                        'card-surface flex w-full items-start gap-2 p-2 text-left transition-colors hover:border-primary-400/50',
                        key === openedVideoKey && !creating && !selectedId && 'border-primary-400/70',
                      )}
                    >
                      <ChannelVideoThumb url={video.thumbnailUrl} className="w-24" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p lang="ja" className="line-clamp-2 text-xs text-foreground">
                          {video.title}
                        </p>
                        <StatusBadge
                          tone={VIDEO_STATUS_TONE[video.status]}
                          label={t(`manual:channelVideo.status.${video.status}`)}
                        />
                        {startingKey === key ? (
                          <p className="text-[11px] text-muted-foreground">{t('manual:channelVideo.source.starting')}</p>
                        ) : null}
                      </div>
                    </button>
                  )
                })
              )}
            </>
          ) : null}
        </aside>

        <section className="min-w-0">
          {creating ? (
            <NewProjectForm
              key={source}
              voicevox={voicevox}
              defaultChannelId={source === NO_GROUP ? undefined : source}
              onCreated={(run) => {
                setSource(run.input.channelId)
                openProject(run.id)
              }}
              onClose={() => setCreating(false)}
            />
          ) : openedVideo && !selectedId ? (
            <ChannelVideoDetail
              key={openedVideoKey}
              video={openedVideo}
              onPatched={patchChannelVideo}
              onClose={() => setOpenedVideoKey(null)}
            />
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
    </PageShell>
  )
}
