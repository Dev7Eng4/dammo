import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { TaskJobListItem, TaskStage, TaskStageStatus } from '../../types/taskQueue'
import { isActiveTaskStatus } from '../../types/taskQueue'

interface ChannelProductionBoardProps {
  jobs: TaskJobListItem[]
  onSelectJob: (job: TaskJobListItem) => void
}

interface ChannelGroup {
  key: string
  name: string
  jobs: TaskJobListItem[]
}

const stageStyles: Record<TaskStageStatus, string> = {
  done: 'border-success/40 bg-success/10 text-success',
  doing: 'border-info/50 bg-info/10 text-info animate-pulse',
  failed: 'border-danger/50 bg-danger/10 text-danger',
  skipped: 'border-border bg-muted/40 text-muted-foreground line-through',
  pending: 'border-border bg-surface text-muted-foreground',
}

function channelKeyOf(job: TaskJobListItem, bulkLabel: string): { key: string; name: string } {
  const payload = job.payload as {
    channelId?: string
    channelName?: string
    channelHandle?: string
    channelIds?: string[]
    allReupChannels?: boolean
  }
  if (payload.channelId) {
    return { key: payload.channelId, name: payload.channelName ?? payload.channelHandle ?? payload.channelId }
  }
  if (payload.allReupChannels || (payload.channelIds?.length ?? 0) > 0) {
    return { key: '__bulk__', name: bulkLabel }
  }
  return { key: '__other__', name: job.subtitle ?? job.title }
}

function StageChips({ stages }: { stages: TaskStage[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {stages.map((stage) => (
        <span
          key={stage.id}
          title={stage.error ?? stage.label}
          className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', stageStyles[stage.status])}
        >
          {stage.label}
        </span>
      ))}
    </div>
  )
}

export function ChannelProductionBoard({ jobs, onSelectJob }: ChannelProductionBoardProps) {
  const { t } = useTranslation('factory')

  const groups = useMemo<ChannelGroup[]>(() => {
    const map = new Map<string, ChannelGroup>()
    for (const job of jobs) {
      if (job.type !== 'create_video' && job.type !== 'upload_video') continue
      if (!isActiveTaskStatus(job.status)) continue
      const { key, name } = channelKeyOf(job, t('queue.board.bulk'))
      const group = map.get(key) ?? { key, name, jobs: [] }
      group.jobs.push(job)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [jobs, t])

  if (groups.length === 0) return null

  return (
    <section className="card-surface mb-3 rounded-2xl p-4">
      <p className="section-label mb-3">{t('queue.board.title')}</p>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="kpi-card p-3">
            <p className="mb-2 truncate text-sm font-semibold text-foreground" title={group.name}>
              {group.name}
            </p>
            <div className="space-y-2.5">
              {group.jobs.map((job) => {
                const stages = job.stages ?? []
                const done = stages.filter((s) => s.status === 'done').length
                const total = stages.filter((s) => s.status !== 'skipped').length
                const percent = total > 0 ? Math.round((done / total) * 100) : Math.round(job.progress)
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onSelectJob(job)}
                    className="block w-full rounded-lg p-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-muted-foreground">
                        {job.type === 'upload_video' ? t('queue.board.upload') : t('queue.board.create')}
                        {job.status === 'queued' ? ` · ${t('queue.board.queued')}` : ''}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">{percent}%</span>
                    </div>
                    <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    {stages.length > 0 ? <StageChips stages={stages} /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
