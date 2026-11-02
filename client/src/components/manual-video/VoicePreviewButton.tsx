import { Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { voicevoxPreviewUrl } from '../../api/videoAgent'
import { Button, useToast } from '../ui'

interface VoicePreviewButtonProps {
  speaker: number
  speed: number
  /** A line from the script when there is one, so the voice is heard on real material. */
  sampleText?: string
  disabled?: boolean
}

/** Plays a short VOICEVOX sample of the selected voice and speed; press again to stop. */
export function VoicePreviewButton({ speaker, speed, sampleText, disabled }: VoicePreviewButtonProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')

  useEffect(() => () => audioRef.current?.pause(), [])

  function stop() {
    audioRef.current?.pause()
    audioRef.current = null
    setState('idle')
  }

  function play() {
    stop()
    const audio = new Audio(voicevoxPreviewUrl(speaker, speed, sampleText))
    audioRef.current = audio
    setState('loading')
    audio.onplaying = () => setState('playing')
    audio.onended = () => setState('idle')
    audio.onerror = () => {
      setState('idle')
      toast.error(t('voicePreview.failed'))
    }
    void audio.play().catch(() => undefined)
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="shrink-0 whitespace-nowrap"
      disabled={disabled}
      onClick={state === 'idle' ? play : stop}
      aria-label={state === 'idle' ? t('voicePreview.play') : t('voicePreview.stop')}
    >
      {state === 'idle' ? <Volume2 className="size-4" /> : <Square className="size-4" />}
      {state === 'loading' ? t('voicePreview.loading') : state === 'playing' ? t('voicePreview.stop') : t('voicePreview.play')}
    </Button>
  )
}
