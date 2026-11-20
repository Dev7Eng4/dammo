import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Sample sentence for voice tests (the channels narrate in Japanese). */
export const SAMPLE_TEXT = 'こんにちは。今日は、心が少し軽くなるお話をゆっくりお届けします。'

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Plays one audio source at a time; clicking the playing one stops it. */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  function stop() {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  function play(id: string, src: string, revoke = false) {
    stop()
    const audio = new Audio(src)
    audioRef.current = audio
    setPlayingId(id)
    audio.onended = () => {
      setPlayingId((current) => (current === id ? null : current))
      if (revoke) URL.revokeObjectURL(src)
    }
    void audio.play().catch(() => setPlayingId(null))
  }

  useEffect(() => stop, [])
  return { playingId, play, stop }
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </label>
  )
}
