import { ImageOff, Pencil, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchManualScenes,
  manualSceneImageUrl,
  regenerateManualScene,
  type ManualSceneItem,
} from '../../api/manualVideo'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'
import { Button, Textarea, useToast } from '../ui'

function shortTime(srt: string): string {
  return srt.replace(/^00:/, '').replace(/,\d+$/, '')
}

interface SceneCardProps {
  runId: string
  scene: ManualSceneItem
  redrawing: boolean
  disabled: boolean
  onRedraw: (prompt?: string) => void
  onOpen: () => void
}

function SceneCard({ runId, scene, redrawing, disabled, onRedraw, onOpen }: SceneCardProps) {
  const { t } = useTranslation('manual')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(scene.prompt)
  const isTitle = scene.title !== undefined

  return (
    <li className={cn('card-surface flex flex-col gap-2 p-2', redrawing && 'border-info/50')}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!scene.hasImage}
        className="relative block aspect-video w-full overflow-hidden rounded-md bg-muted"
        aria-label={t('scenes.open', { n: scene.index + 1 })}
      >
        {scene.hasImage ? (
          <img
            src={manualSceneImageUrl(runId, scene)}
            alt={t('scenes.alt', { n: scene.index + 1 })}
            loading="lazy"
            className={cn('h-full w-full object-cover', redrawing && 'opacity-40')}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" />
          </span>
        )}
        {redrawing ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-info">
            <RefreshCw className="mr-1 size-3.5 animate-spin" />
            {t('scenes.redrawing')}
          </span>
        ) : null}
      </button>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">#{scene.index + 1}</span>
        <span className="tabular-nums">
          {shortTime(scene.startTime)}–{shortTime(scene.endTime)} · {scene.durationSec.toFixed(1)}s
        </span>
      </div>
      {scene.references.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">{t('scenes.cast', { names: scene.references.join(', ') })}</p>
      ) : null}

      {isTitle ? (
        <p lang="ja" className="text-xs text-foreground/90">
          {t('scenes.titleCard', { title: scene.title })}
        </p>
      ) : editing ? (
        <Textarea rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} className="text-xs" />
      ) : (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">{t('scenes.prompt')}</summary>
          <p className="mt-1 text-xs whitespace-pre-line text-foreground/85">{scene.prompt}</p>
        </details>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={disabled || !draft.trim()}
              onClick={() => {
                onRedraw(draft.trim() !== scene.prompt ? draft.trim() : undefined)
                setEditing(false)
              }}
            >
              <RefreshCw className="size-3.5" />
              {t('scenes.redrawWithPrompt')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(scene.prompt)
                setEditing(false)
              }}
            >
              <X className="size-3.5" />
              {t('scenes.cancelEdit')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onRedraw()}>
              <RefreshCw className="size-3.5" />
              {t('scenes.redraw')}
            </Button>
            {!isTitle ? (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                {t('scenes.edit')}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </li>
  )
}

interface SceneGalleryProps {
  runId: string
  /** Changes whenever the project changes, so the list (and redrawn images) reload. */
  reloadKey: string
  /** True while any image work runs on this project (a full pass or a single redraw). */
  imagesBusy: boolean
  disabled: boolean
}

/** Every scene with its image, timing and prompt; each can be redrawn, with the prompt rewritten if needed. */
export function SceneGallery({ runId, reloadKey, imagesBusy, disabled }: SceneGalleryProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [scenes, setScenes] = useState<ManualSceneItem[] | null>(null)
  const [redrawing, setRedrawing] = useState<number | null>(null)
  const [viewer, setViewer] = useState<ManualSceneItem | null>(null)

  useAbortableEffect(
    async (signal) => {
      const { items } = await fetchManualScenes(runId, { signal })
      setScenes(items)
    },
    [runId, reloadKey],
  )

  async function redraw(index: number, prompt?: string) {
    setRedrawing(index)
    try {
      await regenerateManualScene(runId, index, prompt)
    } catch (err) {
      setRedrawing(null)
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (!viewer) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setViewer(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [viewer])

  // The redraw marker lasts only while image work is actually running on the project.
  const activeRedraw = imagesBusy ? redrawing : null

  if (scenes === null) return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  if (scenes.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{t('scenes.title', { count: scenes.length })}</p>
        <p className="text-xs text-muted-foreground">{t('scenes.hint')}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scenes.map((scene) => (
          <SceneCard
            key={`${scene.index}-${scene.imageVersion}`}
            runId={runId}
            scene={scene}
            redrawing={activeRedraw === scene.index}
            disabled={disabled || imagesBusy}
            onRedraw={(prompt) => void redraw(scene.index, prompt)}
            onOpen={() => setViewer(scene)}
          />
        ))}
      </ul>

      {viewer ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewer(null)}
        >
          <div className="max-h-full max-w-5xl space-y-2" onClick={(event) => event.stopPropagation()}>
            <img
              src={manualSceneImageUrl(runId, viewer)}
              alt={t('scenes.alt', { n: viewer.index + 1 })}
              className="max-h-[80vh] w-auto rounded-lg"
            />
            <div className="flex items-start justify-between gap-3 text-xs text-white/85">
              <p className="whitespace-pre-line">
                #{viewer.index + 1} · {shortTime(viewer.startTime)}–{shortTime(viewer.endTime)}
                {viewer.prompt ? `\n${viewer.prompt}` : ''}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setViewer(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
