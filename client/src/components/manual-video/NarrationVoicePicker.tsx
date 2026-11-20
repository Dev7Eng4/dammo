import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Settings2, Square, Volume2 } from 'lucide-react'
import { fetchElevenLabsModels, fetchElevenLabsVoices, fetchVoiceSettings, previewNarrationVoice } from '../../api/voice'
import { useAbortableEffect } from '../../hooks'
import type {
  ElevenLabsModel,
  ElevenLabsVoice,
  VoicevoxEngineStatus,
  VoiceProvider,
  VoiceSettings,
} from '../../types/voice'
import { ElevenLabsVoiceEditor, emptyElevenLabsDraft, type ElevenLabsVoiceDraft } from '../settings/ElevenLabsVoiceEditor'
import { VoicevoxVoiceEditor, emptyVoicevoxDraft, type VoicevoxVoiceDraft } from '../settings/VoicevoxVoiceEditor'
import { Button, Link, Modal, Select, useToast } from '../ui'

export type CustomNarrationVoice = VoicevoxVoiceDraft | ElevenLabsVoiceDraft

export interface NarrationVoiceValue {
  provider: VoiceProvider
  /** A saved voice; ignored while `custom` is set. */
  presetId: string
  /** Settings chosen for this video only. */
  custom: CustomNarrationVoice | null
}

interface NarrationVoicePickerProps {
  value: NarrationVoiceValue
  onChange: (next: NarrationVoiceValue) => void
  speed: number
  /** A line from the script, so the voice is heard on real material. */
  sampleText?: string
  disabled?: boolean
  voicevox: VoicevoxEngineStatus | null
  onRefreshVoicevox: () => void
}

const PROVIDERS: { value: VoiceProvider; label: string }[] = [
  { value: 'voicevox', label: 'VOICEVOX' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
]

const CUSTOM = '__custom__'
const FALLBACK_SAMPLE = 'こんにちは。今日は、心が少し軽くなるお話をゆっくりお届けします。'

function isElevenLabsDraft(custom: CustomNarrationVoice | null): custom is ElevenLabsVoiceDraft {
  return !!custom && 'voiceId' in custom
}

/** A saved voice's sound settings as a custom draft (name, id and timestamps dropped). */
function presetToDraft(
  provider: VoiceProvider,
  settings: VoiceSettings | null,
  presetId: string,
  fallbackSpeaker: number,
): CustomNarrationVoice {
  if (provider === 'elevenlabs') {
    const preset = settings?.elevenlabs.presets.find((item) => item.id === presetId)
    if (!preset) return emptyElevenLabsDraft()
    const { voiceId, voiceName, modelId, stability, similarityBoost, style, speed } = preset
    return { voiceId, voiceName, modelId, stability, similarityBoost, style, speed }
  }
  const preset = settings?.voicevox.presets.find((item) => item.id === presetId)
  if (!preset) return emptyVoicevoxDraft(fallbackSpeaker)
  const { speaker, speakerName, speedScale, pitchScale, intonationScale, volumeScale, pauseLengthScale } = preset
  return { speaker, speakerName, speedScale, pitchScale, intonationScale, volumeScale, pauseLengthScale }
}

/**
 * Voice step: VOICEVOX or ElevenLabs, then one of the voices saved in Settings → Giọng đọc, or
 * "custom for this video" (pick a voice and tune it without saving it). Defaults to the provider's
 * default saved voice.
 */
export function NarrationVoicePicker({
  value,
  onChange,
  speed,
  sampleText,
  disabled,
  voicevox,
  onRefreshVoicevox,
}: NarrationVoicePickerProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [settings, setSettings] = useState<VoiceSettings | null>(null)
  const [preview, setPreview] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Custom-voice modal
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CustomNarrationVoice | null>(null)
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [models, setModels] = useState<ElevenLabsModel[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  useAbortableEffect(async (signal) => {
    const { item } = await fetchVoiceSettings({ signal })
    if (!signal.aborted) setSettings(item)
  }, [])

  useEffect(() => () => audioRef.current?.pause(), [])

  const presets = settings ? settings[value.provider].presets : []
  const defaultId = settings ? settings[value.provider].defaultPresetId : null
  const fallbackSpeaker = settings?.voicevox.effectiveDefaultSpeaker ?? voicevox?.defaultSpeaker ?? 13
  const canUseElevenLabs = (settings?.elevenlabs.keys ?? []).some((key) => key.enabled)

  // No voice chosen yet (or it was deleted) → the provider's default voice.
  useEffect(() => {
    if (!settings || value.custom) return
    if (value.presetId && presets.some((preset) => preset.id === value.presetId)) return
    const fallback = presets.find((preset) => preset.id === defaultId)?.id ?? presets[0]?.id ?? ''
    if (fallback !== value.presetId) onChange({ ...value, presetId: fallback })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, value.provider, value.presetId, value.custom])

  async function loadElevenLabsCatalog() {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const [voiceRes, modelRes] = await Promise.all([fetchElevenLabsVoices(), fetchElevenLabsModels()])
      setVoices(voiceRes.items)
      setModels(modelRes.items)
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : String(err))
    } finally {
      setCatalogLoading(false)
    }
  }

  function openCustom() {
    // Start from the current custom settings, else from the saved voice selected now.
    setDraft(value.custom ?? presetToDraft(value.provider, settings, value.presetId, fallbackSpeaker))
    setEditing(true)
    if (value.provider === 'elevenlabs' && canUseElevenLabs && voices.length === 0 && !catalogLoading) {
      void loadElevenLabsCatalog()
    }
  }

  function applyCustom() {
    if (!draft) return
    onChange({ ...value, custom: draft })
    setEditing(false)
  }

  function stop() {
    audioRef.current?.pause()
    audioRef.current = null
    setPreview('idle')
  }

  function previewBlob(custom: CustomNarrationVoice | null, text: string) {
    return previewNarrationVoice({
      provider: value.provider,
      ...(custom ? { custom: { ...custom } } : { presetId: value.presetId }),
      speed,
      text: text.slice(0, 500),
    })
  }

  async function play() {
    stop()
    setPreview('loading')
    try {
      const blob = await previewBlob(value.custom, sampleText?.trim() || FALLBACK_SAMPLE)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setPreview('idle')
        URL.revokeObjectURL(url)
      }
      await audio.play()
      setPreview('playing')
    } catch (err) {
      setPreview('idle')
      toast.error(err instanceof Error ? err.message : t('voicePreview.failed'))
    }
  }

  const customName = !value.custom
    ? ''
    : isElevenLabsDraft(value.custom)
      ? value.custom.voiceName || value.custom.voiceId
      : (value.custom.speakerName || `#${value.custom.speaker}`).replace(/\s*\(#\d+\)$/, '')
  const options = [
    ...presets.map((preset) => ({
      value: preset.id,
      label: preset.id === defaultId ? `${preset.name} · ${t('voicePick.default')}` : preset.name,
    })),
    { value: CUSTOM, label: value.custom ? t('voicePick.customValue', { name: customName }) : t('voicePick.custom') },
  ]
  const providerName = value.provider === 'voicevox' ? 'VOICEVOX' : 'ElevenLabs'
  const engineDown = value.provider === 'voicevox' && !voicevox?.available
  const ready = value.custom ? true : !!value.presetId

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-36 shrink-0">
          <Select
            options={PROVIDERS}
            value={value.provider}
            onChange={(provider) => onChange({ provider: provider as VoiceProvider, presetId: '', custom: null })}
            disabled={disabled}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Select
            options={options}
            value={value.custom ? CUSTOM : value.presetId}
            onChange={(next) => {
              if (next === CUSTOM) openCustom()
              else onChange({ ...value, presetId: next, custom: null })
            }}
            placeholder={settings ? t('voicePick.none') : t('voicePick.loading')}
            searchable
            disabled={disabled || !settings}
          />
        </div>
        {value.custom ? (
          <Button type="button" size="sm" variant="secondary" className="h-10 shrink-0" disabled={disabled} onClick={openCustom}>
            <Pencil className="size-4" />
            {t('voicePick.editCustom')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-10 shrink-0 whitespace-nowrap"
          disabled={!ready || engineDown || preview === 'loading'}
          onClick={preview === 'idle' ? () => void play() : stop}
        >
          {preview === 'idle' ? <Volume2 className="size-4" /> : <Square className="size-4" />}
          {preview === 'loading' ? t('voicePreview.loading') : preview === 'playing' ? t('voicePreview.stop') : t('voicePreview.play')}
        </Button>
      </div>

      {settings && presets.length === 0 && !value.custom ? (
        <p className="flex flex-wrap items-center gap-1 text-xs text-warning">
          {t('voicePick.empty', { provider: providerName })}
          <Link to="/settings?tab=voice" className="inline-flex items-center gap-1 font-medium text-primary-400 hover:underline">
            <Settings2 className="size-3.5" />
            {t('voicePick.openSettings')}
          </Link>
        </p>
      ) : null}

      {engineDown ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-danger">{t('step.voice.unavailable', { url: voicevox?.url ?? '' })}</p>
          <Button size="sm" variant="secondary" onClick={onRefreshVoicevox}>
            {t('step.voice.recheck')}
          </Button>
        </div>
      ) : null}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('voicePick.customTitle', { provider: providerName })}
        className="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outlined" size="sm" onClick={() => setEditing(false)}>
              {t('voicePick.cancel')}
            </Button>
            <Button size="sm" onClick={applyCustom} disabled={!draft || (isElevenLabsDraft(draft) && !draft.voiceId)}>
              {t('voicePick.useCustom')}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">{t('voicePick.customHint')}</p>
        {draft && isElevenLabsDraft(draft) ? (
          <ElevenLabsVoiceEditor
            draft={draft}
            onChange={(patch) => setDraft((prev) => (prev && isElevenLabsDraft(prev) ? { ...prev, ...patch } : prev))}
            voices={voices}
            models={models}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            canUseApi={canUseElevenLabs}
            onReloadCatalog={() => void loadElevenLabsCatalog()}
            synthesizeTest={(current, text) => previewBlob(current, text)}
          />
        ) : draft ? (
          <VoicevoxVoiceEditor
            draft={draft}
            engine={voicevox}
            onChange={(patch) => setDraft((prev) => (prev && !isElevenLabsDraft(prev) ? { ...prev, ...patch } : prev))}
            synthesizeTest={(current, text) => previewBlob(current, text)}
          />
        ) : null}
      </Modal>
    </div>
  )
}
