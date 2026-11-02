import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchManualNarration, manualAudioUrl, type ManualNarration } from '../../api/manualVideo'
import { useAbortableEffect } from '../../hooks'
import { cn } from '../../lib/cn'

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface VoiceReviewProps {
  runId: string
  /** Changes whenever the voice is regenerated, so the audio and timings reload. */
  version: string
}

/** The finished narration: full player plus every sentence by chapter, each playable on its own. */
export function VoiceReview({ runId, version }: VoiceReviewProps) {
  const { t } = useTranslation('manual')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** End of the sentence or chapter being auditioned; playback pauses there. */
  const stopAtRef = useRef<number | null>(null)
  const [narration, setNarration] = useState<ManualNarration | null | undefined>(undefined)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)

  useAbortableEffect(
    async (signal) => {
      const result = await fetchManualNarration(runId, { signal })
      setNarration(result.narration)
    },
    [runId, version],
  )

  useEffect(() => () => audioRef.current?.pause(), [])

  function playRange(start: number, end: number) {
    const audio = audioRef.current
    if (!audio) return
    if (playing && range?.start === start && range.end === end) {
      audio.pause()
      return
    }
    stopAtRef.current = end
    setRange({ start, end })
    audio.currentTime = start
    void audio.play().catch(() => undefined)
  }

  function onTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setNow(audio.currentTime)
    if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
      stopAtRef.current = null
      audio.pause()
    }
  }

  if (narration === undefined) return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  if (narration === null) return null

  const sentenceCount = narration.chapters.reduce((sum, chapter) => sum + chapter.sentences.length, 0)
  const isOn = (start: number, end: number) => playing && now >= start && now < end
  const isAuditioning = (start: number, end: number) => playing && range?.start === start && range.end === end

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {t('narration.title', { chapters: narration.chapters.length, sentences: sentenceCount, duration: clock(narration.durationSec) })}
        </p>
        <p className="text-xs text-muted-foreground">{t('narration.hint')}</p>
      </div>
      {!narration.aligned ? <p className="text-xs text-warning">{t('narration.misaligned')}</p> : null}

      <audio
        ref={audioRef}
        className="w-full"
        controls
        preload="metadata"
        src={manualAudioUrl(runId, version)}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        // Seeking with the player's own bar means listening on, not auditioning a sentence.
        onSeeking={() => {
          const audio = audioRef.current
          if (audio && stopAtRef.current !== null && (audio.currentTime < (range?.start ?? 0) - 0.05 || audio.currentTime > stopAtRef.current)) {
            stopAtRef.current = null
            setRange(null)
          }
        }}
      />

      <div className="space-y-2">
        {narration.chapters.map((chapter, chapterIndex) => (
          <details key={chapterIndex} open={chapterIndex === 0} className="card-surface p-2">
            <summary className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  playRange(chapter.start, chapter.end)
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/70"
                aria-label={t('narration.playChapter', { n: chapterIndex + 1 })}
              >
                {isAuditioning(chapter.start, chapter.end) ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <span lang="ja" className={cn('min-w-0 flex-1 font-medium', isOn(chapter.start, chapter.end) ? 'text-info' : 'text-foreground')}>
                {chapterIndex + 1}. {chapter.heading}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {clock(chapter.start)}–{clock(chapter.end)} · {clock(chapter.end - chapter.start)}
              </span>
            </summary>
            <ol className="mt-2 space-y-0.5">
              {chapter.sentences.map((sentence, sentenceIndex) => {
                const on = isOn(sentence.start, sentence.end)
                return (
                  <li key={sentenceIndex}>
                    <button
                      type="button"
                      onClick={() => playRange(sentence.start, sentence.end)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60',
                        on && 'bg-info/10',
                      )}
                    >
                      {isAuditioning(sentence.start, sentence.end) ? (
                        <Pause className="mt-0.5 size-3.5 shrink-0 text-info" />
                      ) : (
                        <Play className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="w-10 shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground">{clock(sentence.start)}</span>
                      <span lang="ja" className={cn('text-sm', on ? 'text-foreground' : 'text-foreground/85')}>
                        {sentence.text}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </details>
        ))}
      </div>
    </div>
  )
}
