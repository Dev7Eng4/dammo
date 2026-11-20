import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, RefreshCw, Square } from 'lucide-react'
import { synthesizeSpeech } from '../../api/voice'
import type { ElevenLabsModel, ElevenLabsVoice, VoicePresetPayload } from '../../types/voice'
import { Button, DropdownSelect, Input, useToast } from '../ui'
import { Field, SAMPLE_TEXT, errorMessage, useAudioPlayer } from './voicePresetShared'

/** Everything about an ElevenLabs voice except its saved name. */
export type ElevenLabsVoiceDraft = Omit<VoicePresetPayload, 'name'>

export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2'

export function emptyElevenLabsDraft(): ElevenLabsVoiceDraft {
  return { voiceId: '', voiceName: '', modelId: DEFAULT_ELEVENLABS_MODEL, stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1 }
}

const triggerClassName = 'h-10 w-full rounded-lg text-sm'

type SliderKey = 'stability' | 'similarityBoost' | 'style' | 'speed'
const SLIDERS: { key: SliderKey; min: number; max: number; step: number }[] = [
  { key: 'stability', min: 0, max: 1, step: 0.05 },
  { key: 'similarityBoost', min: 0, max: 1, step: 0.05 },
  { key: 'style', min: 0, max: 1, step: 0.05 },
  { key: 'speed', min: 0.7, max: 1.2, step: 0.05 },
]

export interface ElevenLabsVoiceEditorProps {
  draft: ElevenLabsVoiceDraft
  onChange: (patch: Partial<ElevenLabsVoiceDraft>) => void
  voices: ElevenLabsVoice[]
  models: ElevenLabsModel[]
  catalogLoading: boolean
  catalogError: string | null
  canUseApi: boolean
  onReloadCatalog: () => void
  /** How the test button makes audio; defaults to plain text-to-speech with the draft settings. */
  synthesizeTest?: (draft: ElevenLabsVoiceDraft, text: string) => Promise<Blob>
}

/** Voice + model + voice settings + a test player. Used by the saved-voice modal and per-video settings. */
export function ElevenLabsVoiceEditor({
  draft,
  onChange,
  voices,
  models,
  catalogLoading,
  catalogError,
  canUseApi,
  onReloadCatalog,
  synthesizeTest,
}: ElevenLabsVoiceEditorProps) {
  const { t } = useTranslation(['factory', 'common'])
  const { toast } = useToast()
  const player = useAudioPlayer()
  const [testText, setTestText] = useState(SAMPLE_TEXT)
  const [testing, setTesting] = useState(false)

  const selectedVoice = voices.find((voice) => voice.voiceId === draft.voiceId)
  const voiceOptions = voices.map((voice) => ({
    value: voice.voiceId,
    label: voice.category ? `${voice.name} · ${voice.category}` : voice.name,
  }))
  if (draft.voiceId && !selectedVoice) voiceOptions.unshift({ value: draft.voiceId, label: draft.voiceName || draft.voiceId })

  const modelOptions = models.map((model) => ({ value: model.modelId, label: `${model.name} (${model.modelId})` }))
  if (!modelOptions.some((option) => option.value === draft.modelId)) {
    modelOptions.unshift({ value: draft.modelId, label: draft.modelId })
  }

  const voiceLabels = selectedVoice?.labels ? Object.values(selectedVoice.labels).filter(Boolean).join(' · ') : ''

  async function test() {
    if (player.playingId === 'draft') return player.stop()
    setTesting(true)
    try {
      const text = testText.trim() || SAMPLE_TEXT
      const blob = synthesizeTest
        ? await synthesizeTest(draft, text)
        : await synthesizeSpeech({
            provider: 'elevenlabs',
            text,
            voiceId: draft.voiceId,
            modelId: draft.modelId,
            stability: draft.stability,
            similarityBoost: draft.similarityBoost,
            style: draft.style,
            speed: draft.speed,
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
      {!canUseApi || catalogError ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="text-xs text-warning">{!canUseApi ? t('factory:settings.voice.preset.needKeyForList') : catalogError}</p>
          {canUseApi ? (
            <Button size="sm" variant="ghost" onClick={onReloadCatalog} disabled={catalogLoading}>
              {catalogLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Field label={t('factory:settings.voice.el.voice')} hint={voiceLabels || undefined}>
        <div className="flex gap-2">
          <DropdownSelect
            value={draft.voiceId}
            options={voiceOptions}
            searchable
            placeholder={catalogLoading ? t('factory:settings.voice.preset.loadingVoices') : t('factory:settings.voice.noVoice')}
            onChange={(voiceId) => {
              const voice = voices.find((item) => item.voiceId === voiceId)
              onChange({ voiceId, voiceName: voice?.name ?? voiceId })
            }}
            triggerClassName={triggerClassName}
            className="min-w-0 flex-1"
          />
          {selectedVoice?.previewUrl ? (
            <Button
              variant="outlined"
              size="icon"
              title={t('factory:settings.voice.preset.sample')}
              onClick={() => (player.playingId === 'sample' ? player.stop() : player.play('sample', selectedVoice.previewUrl!))}
            >
              {player.playingId === 'sample' ? <Square className="size-4" /> : <Play className="size-4" />}
            </Button>
          ) : null}
        </div>
      </Field>

      <Field label={t('factory:settings.voice.el.model')}>
        <DropdownSelect
          value={draft.modelId}
          options={modelOptions}
          onChange={(modelId) => onChange({ modelId })}
          triggerClassName={triggerClassName}
          className="w-full"
        />
      </Field>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {SLIDERS.map(({ key, min, max, step }) => (
          <label key={key} className="block space-y-1">
            <span className="flex items-center justify-between text-xs font-medium text-foreground/80">
              {t(`factory:settings.voice.el.${key}`)}
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
            <p className="text-[11px] text-muted-foreground">{t(`factory:settings.voice.preset.hint.${key}`)}</p>
          </label>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/50 p-3">
        <span className="text-xs font-medium text-foreground/80">{t('factory:settings.voice.test')}</span>
        <div className="flex gap-2">
          <Input className="h-9 min-w-0 flex-1" value={testText} maxLength={1000} onChange={(event) => setTestText(event.target.value)} />
          <Button size="sm" className="h-9 shrink-0" variant="secondary" disabled={!draft.voiceId || testing} onClick={() => void test()}>
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
