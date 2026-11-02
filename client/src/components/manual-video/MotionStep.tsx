import { Clapperboard, Film, ImageIcon, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchManualScenes,
  manualSceneClipUrl,
  manualSceneImageUrl,
  type ManualMotionMode,
  type ManualSceneItem,
} from '../../api/manualVideo'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'
import { Button } from '../ui'

/** Same values as the server: intro window and the length of one Flow clip. */
const INTRO_SEC = 30
const CLIP_SEC = 8
const MODES: ManualMotionMode[] = ['intro', 'full', 'scenes']

function toSec(srt: string): number {
  const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(srt)
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : 0
}

function shortTime(srt: string): string {
  return srt.replace(/^00:/, '').replace(/,\d+$/, '')
}

interface MotionStepProps {
  runId: string
  /** Changes whenever the project changes, so the list reloads. */
  reloadKey: string
  motionDefault: ManualMotionMode | 'none'
  /** True while clips are being made on this project. */
  working: boolean
  disabled: boolean
  onGenerate: (mode: ManualMotionMode, indexes?: number[]) => void
  onRemove: (index: number) => void
}

/** Turns scene images into short Flow (Veo) clips: the intro, every scene, or hand-picked ones. */
export function MotionStep({ runId, reloadKey, motionDefault, working, disabled, onGenerate, onRemove }: MotionStepProps) {
  const { t } = useTranslation('manual')
  const [scenes, setScenes] = useState<ManualSceneItem[] | null>(null)
  const [mode, setMode] = useState<ManualMotionMode>(motionDefault === 'none' ? 'intro' : motionDefault)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())

  useAbortableEffect(
    async (signal) => {
      const { items } = await fetchManualScenes(runId, { signal })
      setScenes(items)
    },
    [runId, reloadKey],
  )

  if (scenes === null) return <div className="h-24 animate-pulse rounded-lg bg-muted" />

  const eligible = (scene: ManualSceneItem) => scene.hasImage && scene.title === undefined
  const targets = scenes.filter(
    (scene) =>
      eligible(scene) &&
      (mode === 'full' || (mode === 'intro' && toSec(scene.startTime) < INTRO_SEC) || (mode === 'scenes' && picked.has(scene.index))),
  )
  const todo = targets.filter((scene) => !scene.hasClip)
  const frozen = targets.filter((scene) => scene.durationSec > CLIP_SEC)
  const frozenSec = Math.round(frozen.reduce((sum, scene) => sum + scene.durationSec - CLIP_SEC, 0))
  const clipCount = scenes.filter((scene) => scene.hasClip).length

  function toggle(index: number) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="section-label">{t('motion.mode')}</span>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((value) => (
            <Button key={value} size="sm" variant={mode === value ? 'primary' : 'secondary'} onClick={() => setMode(value)}>
              {t(`motion.modes.${value}`, { sec: INTRO_SEC })}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {motionDefault === 'none' ? t('motion.channelImages') : t('motion.channelDefault', { mode: t(`motion.modes.${motionDefault}`, { sec: INTRO_SEC }) })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={disabled || todo.length === 0}
          onClick={() => onGenerate(mode, mode === 'scenes' ? todo.map((scene) => scene.index) : undefined)}
        >
          <Clapperboard className="size-4" />
          {working ? t('motion.working') : t('motion.run', { count: todo.length })}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('motion.summary', { targets: targets.length, done: targets.length - todo.length, clips: clipCount, total: scenes.length })}
        </span>
      </div>
      {frozen.length > 0 ? (
        <p className="text-xs text-warning">{t('motion.frozen', { count: frozen.length, clip: CLIP_SEC, sec: frozenSec })}</p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scenes.map((scene) => {
          const isTarget = targets.includes(scene)
          return (
            <li key={`${scene.index}-${scene.clipVersion}`} className={cn('card-surface flex flex-col gap-2 p-2', isTarget && !scene.hasClip && 'border-info/50')}>
              <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                {scene.hasClip ? (
                  <video
                    className="h-full w-full object-cover"
                    src={manualSceneClipUrl(runId, scene)}
                    poster={scene.hasImage ? manualSceneImageUrl(runId, scene) : undefined}
                    muted
                    loop
                    playsInline
                    preload="none"
                    onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(event) => event.currentTarget.pause()}
                  />
                ) : scene.hasImage ? (
                  <img src={manualSceneImageUrl(runId, scene)} alt={t('scenes.alt', { n: scene.index + 1 })} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
                <span
                  className={cn(
                    'absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    scene.hasClip ? 'bg-info text-white' : 'bg-black/60 text-white',
                  )}
                >
                  {scene.hasClip ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                  {scene.hasClip ? t('motion.badgeClip') : t('motion.badgeImage')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <label className="flex items-center gap-1.5 font-medium text-foreground">
                  {mode === 'scenes' && eligible(scene) ? (
                    <input type="checkbox" checked={picked.has(scene.index)} onChange={() => toggle(scene.index)} />
                  ) : null}
                  #{scene.index + 1}
                </label>
                <span className={cn('tabular-nums', scene.durationSec > CLIP_SEC && isTarget && 'text-warning')}>
                  {shortTime(scene.startTime)}–{shortTime(scene.endTime)} · {scene.durationSec.toFixed(1)}s
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5">
                {scene.hasClip ? (
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(scene.index)}>
                    <Undo2 className="size-3.5" />
                    {t('motion.remove')}
                  </Button>
                ) : eligible(scene) ? (
                  <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onGenerate('scenes', [scene.index])}>
                    <Clapperboard className="size-3.5" />
                    {t('motion.one')}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{t('motion.titleCard')}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
