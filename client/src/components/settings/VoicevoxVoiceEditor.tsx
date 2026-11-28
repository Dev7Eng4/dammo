import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, Square } from 'lucide-react'
import { synthesizeSpeech } from '../../api/voice'
import type { VoiceEngine, VoicevoxEngineStatus, VoicevoxPresetPayload } from '../../types/voice'
import { Button, DropdownSelect, Input, useToast } from '../ui'
import { Field, SAMPLE_TEXT, errorMessage, useAudioPlayer } from './voicePresetShared'

/** Everything about a VOICEVOX voice except its saved name. */
export type VoicevoxVoiceDraft = Omit<VoicevoxPresetPayload, 'name'>

export function emptyVoicevoxDraft(speaker: number): VoicevoxVoiceDraft {
  return { speaker, speakerName: '', speedScale: 1, pitchScale: 0, intonationScale: 1, volumeScale: 1, pauseLengthScale: 1 }
}

const triggerClassName = 'h-10 w-full rounded-lg text-sm'

type SliderKey = 'speedScale' | 'pitchScale' | 'intonationScale' | 'volumeScale' | 'pauseLengthScale'
const SLIDERS: { key: SliderKey; min: number; max: number; step: number }[] = [
  { key: 'speedScale', min: 0.5, max: 2, step: 0.05 },
  { key: 'pitchScale', min: -0.15, max: 0.15, step: 0.01 },
  { key: 'intonationScale', min: 0, max: 2, step: 0.05 },
  { key: 'volumeScale', min: 0, max: 2, step: 0.05 },
  { key: 'pauseLengthScale', min: 0, max: 2, step: 0.05 },
]

/** VOICEVOX speaker styles as dropdown options ("Speaker — Style (#id)"). */
export function voicevoxSpeakerOptions(engine: VoicevoxEngineStatus | null) {
  return (engine?.speakers ?? []).flatMap((speaker) =>
    speaker.styles.map((style) => ({
      value: String(style.id),
      label: `${speaker.name} — ${style.name} (#${style.id})`,
      group: speaker.name,
    })),
  )
}

export interface VoicevoxVoiceEditorProps {
  draft: VoicevoxVoiceDraft
  onChange: (patch: Partial<VoicevoxVoiceDraft>) => void
  engine: VoicevoxEngineStatus | null
  /** Which engine the speakers come from; default VOICEVOX. */
  provider?: VoiceEngine
  /** How the test button makes audio; defaults to plain text-to-speech with the draft settings. */
  synthesizeTest?: (draft: VoicevoxVoiceDraft, text: string) => Promise<Blob>
}

/** Speaker + prosody sliders + a test player. Used by the saved-voice modal and per-video settings. */
export function VoicevoxVoiceEditor({ draft, onChange, engine, provider = 'voicevox', synthesizeTest }: VoicevoxVoiceEditorProps) {
  const { t } = useTranslation(['factory', 'common'])
  const { toast } = useToast()
  const player = useAudioPlayer()
  const [testText, setTestText] = useState(SAMPLE_TEXT)
  const [testing, setTesting] = useState(false)
  const engineUp = engine?.available ?? false

  const speakerOptions = voicevoxSpeakerOptions(engine)
  if (!speakerOptions.some((option) => option.value === String(draft.speaker))) {
    speakerOptions.unshift({ value: String(draft.speaker), label: draft.speakerName || `#${draft.speaker}`, group: '—' })
  }

  async function test() {
    if (player.playingId === 'draft') return player.stop()
    setTesting(true)
    try {
      const text = testText.trim() || SAMPLE_TEXT
      const blob = synthesizeTest
        ? await synthesizeTest(draft, text)
        : await synthesizeSpeech({
            provider,
            text,
            speaker: draft.speaker,
            speed: draft.speedScale,
            pitchScale: draft.pitchScale,
            intonationScale: draft.intonationScale,
            volumeScale: draft.volumeScale,
            pauseLengthScale: draft.pauseLengthScale,
          })
      player.play('draft', URL.createObjectURL(blob), true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {!engineUp ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {provider === 'aivisspeech' ? t('factory:settings.voice.aivis.needEngine') : t('factory:settings.voice.vvp.needEngine')}
        </p>
      ) : null}

      <Field label={t('factory:settings.voice.el.voice')}>
        <DropdownSelect
          value={String(draft.speaker)}
          options={speakerOptions}
          searchable
          onChange={(value) =>
            onChange({
              speaker: Number(value),
              speakerName: speakerOptions.find((option) => option.value === value)?.label ?? `#${value}`,
            })
          }
          triggerClassName={triggerClassName}
          className="w-full"
        />
      </Field>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {SLIDERS.map(({ key, min, max, step }) => (
          <label key={key} className="block space-y-1">
            <span className="flex items-center justify-between text-xs font-medium text-foreground/80">
              {t(`factory:settings.voice.vvp.${key}`)}
              <span className="tabular-nums text-muted-foreground">{draft[key].toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={draft[key]}
              onChange={(event) => onChange({ [key]: Number(event.target.value) })}
              className="w-full accent-primary-500"
            />
            <p className="text-[11px] text-muted-foreground">{t(`factory:settings.voice.vvp.hint.${key}`)}</p>
          </label>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/50 p-3">
        <span className="text-xs font-medium text-foreground/80">{t('factory:settings.voice.test')}</span>
        <div className="flex gap-2">
          <Input className="h-9 min-w-0 flex-1" value={testText} maxLength={1000} onChange={(event) => setTestText(event.target.value)} />
          <Button size="sm" className="h-9 shrink-0" variant="secondary" disabled={!engineUp || testing} onClick={() => void test()}>
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : player.playingId === 'draft' ? (
              <Square className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
            {t('factory:settings.voice.play')}
          </Button>
        </div>
      </div>
    </div>
  )
}
