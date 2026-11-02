import { Check, Copy, FolderOpen, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  fetchManualLibrary,
  openManualPath,
  type LibraryPhase,
  type ManualLibraryItem,
} from '../../api/manualVideo'
import { videoAgentVideoUrl } from '../../api/videoAgent'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'
import { VIDEO_AGENT_STAGES } from '../../types/videoAgent'
import { Button, PageTabs, StatusBadge, useToast } from '../ui'

type Filter = 'all' | LibraryPhase

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(sec?: number | null): string {
  if (!sec) return ''
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

/** Everything made so far at any stage: finished videos, projects part-way through, and loose transcript downloads. */
export function VideoLibrary({ reloadKey }: { reloadKey: number }) {
  const { t, i18n } = useTranslation(['manual', 'agent'])
  const { toast } = useToast()
  const navigate = useNavigate()
  const [roots, setRoots] = useState<{ projects: string; downloads: string } | null>(null)
  const [items, setItems] = useState<ManualLibraryItem[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [playing, setPlaying] = useState<string | null>(null)

  useAbortableEffect(
    async (signal) => {
      const library = await fetchManualLibrary({ signal })
      setRoots({ projects: library.root, downloads: library.downloadsRoot })
      setItems(library.items)
    },
    [reloadKey],
  )

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('manual:detail.copied')),
      () => toast.error(text),
    )
  }

  const count = (phase: LibraryPhase) => (items ?? []).filter((item) => item.phase === phase).length
  const visible = (items ?? []).filter((item) => filter === 'all' || item.phase === filter)

  return (
    <div className="space-y-3">
      <div className="card-surface space-y-1.5 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label">{t('manual:library.projectsRoot')}</span>
          <code className="min-w-0 flex-1 font-mono break-all text-foreground/90">{roots?.projects ?? '…'}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label">{t('manual:library.downloadsRoot')}</span>
          <code className="min-w-0 flex-1 font-mono break-all text-foreground/90">{roots?.downloads ?? '…'}</code>
        </div>
        <p className="text-muted-foreground">{t('manual:library.rootHint')}</p>
      </div>

      <PageTabs
        variant="pill"
        items={[
          { id: 'all', label: `${t('manual:library.filter.all')} (${items?.length ?? 0})` },
          { id: 'finished', label: `${t('manual:library.filter.finished')} (${count('finished')})` },
          { id: 'in_progress', label: `${t('manual:library.filter.inProgress')} (${count('in_progress')})` },
          { id: 'download', label: `${t('manual:library.filter.download')} (${count('download')})` },
        ]}
        value={filter}
        onValueChange={(value) => setFilter(value as Filter)}
      />

      {items === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : visible.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">{t('manual:library.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <li key={item.key} className="card-surface space-y-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p lang="ja" className="text-sm font-medium break-words text-foreground">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      item.channelName,
                      new Date(item.updatedAt).toLocaleString(i18n.language),
                      item.chars ? t('manual:library.chars', { chars: item.chars, minutes: item.minutes ?? '?' }) : '',
                      formatDuration(item.durationSec),
                      item.sizeBytes ? formatBytes(item.sizeBytes) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <StatusBadge
                  tone={item.kind === 'manual' ? 'primary' : item.kind === 'agent' ? 'info' : 'neutral'}
                  label={t(`manual:library.kind.${item.kind}`)}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {VIDEO_AGENT_STAGES.map((stage) => {
                  const done = item.stagesDone.includes(stage)
                  return (
                    <span
                      key={stage}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                        done ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="size-3" /> : null}
                      {t(`agent:stage.${stage}`)}
                    </span>
                  )
                })}
              </div>

              <p className="font-mono text-[11px] break-all text-muted-foreground">{item.folder}</p>

              <div className="flex flex-wrap gap-2">
                {item.videoPath && item.runId ? (
                  <Button size="sm" variant="secondary" onClick={() => setPlaying(playing === item.key ? null : item.key)}>
                    <Play className="size-4" />
                    {t('manual:library.play')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openManualPath(item.folder).catch((err) => toast.error(String(err)))}
                >
                  <FolderOpen className="size-4" />
                  {t('manual:detail.openFolder')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(item.folder)}>
                  <Copy className="size-4" />
                  {t('manual:detail.copy')}
                </Button>
                {item.runId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(item.kind === 'manual' ? `/manual-video/${item.runId}` : `/video-agent/${item.runId}`)}
                  >
                    {t('manual:library.openProject')}
                  </Button>
                ) : null}
              </div>

              {item.files.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t('manual:library.files')} ({item.files.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {item.files.map((file) => (
                      <li key={file.path} className="flex flex-wrap items-center gap-2">
                        <span className="w-20 shrink-0 text-muted-foreground">{t(`manual:library.file.${file.kind}`)}</span>
                        <code className="min-w-0 flex-1 font-mono break-all text-foreground/85">{file.path}</code>
                        <span className="tabular-nums text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t('manual:detail.copy')}
                          onClick={() => copy(file.path)}
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {item.videoPath && item.runId ? (
                <video
                  className={cn('w-full rounded-lg bg-black', playing === item.key ? 'block' : 'hidden')}
                  controls
                  preload="none"
                  src={playing === item.key ? videoAgentVideoUrl(item.runId) : undefined}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
