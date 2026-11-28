import { Clapperboard, Copy, Film, ImageIcon, Replace, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualMotionMode, ManualSceneItem, MotionClipProvider } from '../../api/manualVideo'
import { fetchPromptSettings } from '../../api/prompts'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'
import { Button, useToast } from '../ui'

/** Same values as the server: intro window, length of one Flow clip, image run between interleaved clips. */
const INTRO_SEC = 60
const CLIP_SEC = 8
/** After the intro, the next clip starts this long after the previous clip starts. */
const INTERLEAVED_MIN_GAP_SEC = 90
const INTERLEAVED_MAX_GAP_SEC = 150
const MODES: ManualMotionMode[] = ['intro', 'interleaved', 'full', 'scenes']
const PROVIDERS: MotionClipProvider[] = ['flow', 'muse', 'meta']
/** Remembered per browser: the last clip maker picked in this step. Unset → the "Tạo video" choice in Settings. */
const PROVIDER_STORAGE_KEY = 'motion.clipProvider'

function readStoredProvider(): MotionClipProvider | null {
  try {
    const value = window.localStorage.getItem(PROVIDER_STORAGE_KEY)
    return value === 'muse' || value === 'flow' || value === 'meta' ? value : null
  } catch {
    return null
  }
}

function storeProvider(provider: MotionClipProvider): void {
  try {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
  } catch {
    // Private window or blocked storage: the choice just is not remembered.
  }
}

function toSec(srt: string): number {
  const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(srt)
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : 0
}

/** Mirrors the server's `selectInterleavedScenes`: longer-than-clip scenes freeze, so they cost more. */
function clipFitCost(durationSec: number): number {
  return durationSec > CLIP_SEC ? (durationSec - CLIP_SEC) * 3 : CLIP_SEC - durationSec
}

function interleavedIndexes(eligible: ManualSceneItem[]): Set<number> {
  const picked = new Set<number>()
  let cursor = 0
  while (cursor < eligible.length && toSec(eligible[cursor]!.startTime) < INTRO_SEC) {
    picked.add(eligible[cursor]!.index)
    cursor += 1
  }
  const start = (i: number) => toSec(eligible[i]!.startTime)
  let lastStart = cursor > 0 ? start(cursor - 1) : 0
  for (;;) {
    while (cursor < eligible.length && start(cursor) < lastStart + INTERLEAVED_MIN_GAP_SEC) cursor += 1
    if (cursor >= eligible.length) break
    let best = cursor
    for (let i = cursor + 1; i < eligible.length && start(i) <= lastStart + INTERLEAVED_MAX_GAP_SEC; i += 1) {
      if (clipFitCost(eligible[i]!.durationSec) < clipFitCost(eligible[best]!.durationSec)) best = i
    }
    picked.add(eligible[best]!.index)
    lastStart = start(best)
    cursor = best + 1
  }
  return picked
}

/** 90 → "1:30", 150 → "2:30". */
function fmtGap(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function shortTime(srt: string): string {
  return srt.replace(/^00:/, '').replace(/,\d+$/, '')
}

export interface MotionStepProps {
  /** Loads the scene list (manual project or channel video). */
  loadScenes: (signal: AbortSignal) => Promise<ManualSceneItem[]>
  imageUrl: (scene: ManualSceneItem) => string
  clipUrl: (scene: ManualSceneItem) => string
  /** Changes whenever the project changes, so the list reloads. */
  reloadKey: string
  motionDefault: ManualMotionMode | 'none'
  /** True while clips are being made on this project. */
  working: boolean
  disabled: boolean
  onGenerate: (mode: ManualMotionMode, indexes: number[] | undefined, provider: MotionClipProvider) => void
  onRemove: (index: number) => void
  /** When set, each scene gets a "replace clip" button that takes an mp4 from disk. */
  onReplace?: (index: number, file: File) => void
}

/** Turns scene images into short clips with Flow (Veo) or Muse: the intro, every scene, or hand-picked ones. */
export function MotionStep({
  loadScenes,
  imageUrl,
  clipUrl,
  reloadKey,
  motionDefault,
  working,
  disabled,
  onGenerate,
  onRemove,
  onReplace,
}: MotionStepProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [scenes, setScenes] = useState<ManualSceneItem[] | null>(null)
  const [mode, setMode] = useState<ManualMotionMode>(motionDefault === 'none' ? 'intro' : motionDefault)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [provider, setProvider] = useState<MotionClipProvider>(() => readStoredProvider() ?? 'flow')

  // No choice made in this browser yet: start on the clip maker picked in Settings → Công cụ AI.
  useAbortableEffect(async (signal) => {
    if (readStoredProvider()) return
    const { item } = await fetchPromptSettings({ signal })
    if (!signal.aborted && !readStoredProvider()) setProvider(item.defaultVideoProvider)
  }, [])

  function pickProvider(value: MotionClipProvider) {
    setProvider(value)
    storeProvider(value)
  }

  useAbortableEffect(
    async (signal) => {
      const items = await loadScenes(signal)
      if (!signal.aborted) setScenes(items)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadKey],
  )

  if (scenes === null) return <div className="h-24 animate-pulse rounded-lg bg-muted" />

  const eligible = (scene: ManualSceneItem) => scene.hasImage && scene.title === undefined
  const interleaved = mode === 'interleaved' ? interleavedIndexes(scenes.filter(eligible)) : null
  const modeLabel = (value: ManualMotionMode) =>
    t(`motion.modes.${value}`, { sec: INTRO_SEC, min: fmtGap(INTERLEAVED_MIN_GAP_SEC), max: fmtGap(INTERLEAVED_MAX_GAP_SEC) })
  const targets = scenes.filter(
    (scene) =>
      eligible(scene) &&
      (mode === 'full' ||
        (mode === 'intro' && toSec(scene.startTime) < INTRO_SEC) ||
        (interleaved?.has(scene.index) ?? false) ||
        (mode === 'scenes' && picked.has(scene.index))),
  )
  const todo = targets.filter((scene) => !scene.hasClip)
  const frozen = targets.filter((scene) => scene.durationSec > CLIP_SEC)
  const frozenSec = Math.round(frozen.reduce((sum, scene) => sum + scene.durationSec - CLIP_SEC, 0))
  const clipCount = scenes.filter((scene) => scene.hasClip).length

  function copyPrompt(scene: ManualSceneItem) {
    const text = scene.motionPrompt ?? ''
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('motion.promptCopied', { index: scene.index + 1 })),
      () => toast.error(text),
    )
  }

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
            <Button key={value} size="sm" className="h-7 px-2.5" variant={mode === value ? 'primary' : 'secondary'} onClick={() => setMode(value)}>
              {modeLabel(value)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {motionDefault === 'none' ? t('motion.channelImages') : t('motion.channelDefault', { mode: modeLabel(motionDefault) })}
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="section-label">{t('motion.provider')}</span>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((value) => (
            <Button key={value} size="sm" className="h-7 px-2.5" variant={provider === value ? 'primary' : 'secondary'} onClick={() => pickProvider(value)}>
              {t(`motion.providers.${value}`)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(`motion.providerHint.${provider}`)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm" className="h-7 px-2.5"
          disabled={disabled || todo.length === 0}
          onClick={() => onGenerate(mode, mode === 'scenes' ? todo.map((scene) => scene.index) : undefined, provider)}
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
                    src={clipUrl(scene)}
                    poster={scene.hasImage ? imageUrl(scene) : undefined}
                    muted
                    loop
                    playsInline
                    preload="none"
                    onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(event) => event.currentTarget.pause()}
                  />
                ) : scene.hasImage ? (
                  <img src={imageUrl(scene)} alt={t('scenes.alt', { n: scene.index + 1 })} loading="lazy" className="h-full w-full object-cover" />
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
                  <Button size="sm" className="h-7 px-2.5" variant="ghost" disabled={disabled} onClick={() => onRemove(scene.index)}>
                    <Undo2 className="size-3.5" />
                    {t('motion.remove')}
                  </Button>
                ) : eligible(scene) ? (
                  <Button size="sm" className="h-7 px-2.5" variant="secondary" disabled={disabled} onClick={() => onGenerate('scenes', [scene.index], provider)}>
                    <Clapperboard className="size-3.5" />
                    {t('motion.one')}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{t('motion.titleCard')}</span>
                )}
                {onReplace && eligible(scene) ? (
                  <label
                    className={cn(
                      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted',
                      disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Replace className="size-3.5" />
                    {t('motion.replace')}
                    <input
                      type="file"
                      accept="video/mp4,.mp4"
                      className="hidden"
                      disabled={disabled}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (file) onReplace(scene.index, file)
                      }}
                    />
                  </label>
                ) : null}
                {scene.motionPrompt && eligible(scene) ? (
                  <Button size="sm" className="h-7 px-2.5" variant="ghost" title={scene.motionPrompt} onClick={() => copyPrompt(scene)}>
                    <Copy className="size-3.5" />
                    {t('motion.copyPrompt')}
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
