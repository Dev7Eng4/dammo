import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Play, Plus, Square, Star, Trash2 } from 'lucide-react'
import {
  createVoicevoxPreset,
  deleteVoicevoxPreset,
  setDefaultVoicevoxPreset,
  synthesizeSpeech,
  updateVoicevoxPreset,
} from '../../api/voice'
import type {
  SpeechEngineSettings,
  VoiceEngine,
  VoicevoxEngineStatus,
  VoicevoxPresetPayload,
  VoicevoxVoicePreset,
} from '../../types/voice'
import { Button, Input, Modal, useToast } from '../ui'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { VoicevoxVoiceEditor, emptyVoicevoxDraft, voicevoxSpeakerOptions } from './VoicevoxVoiceEditor'
import { Field, SAMPLE_TEXT, errorMessage, useAudioPlayer } from './voicePresetShared'

function emptyDraft(speaker: number): VoicevoxPresetPayload {
  return { name: '', ...emptyVoicevoxDraft(speaker) }
}

export interface VoicevoxVoicePresetsProps {
  settings: SpeechEngineSettings
  engine: VoicevoxEngineStatus | null
  /** Which engine these voices belong to; default VOICEVOX. */
  provider?: VoiceEngine
  onChange: (patch: Partial<Pick<SpeechEngineSettings, 'presets' | 'defaultPresetId'>>) => void
}

/**
 * Saved VOICEVOX voices: "Thêm voice" picks a speaker style from the running engine, tunes speed /
 * pitch / intonation / volume / pauses and saves it under a name; the default one is used whenever a
 * caller doesn't pick a voice.
 */
export function VoicevoxVoicePresets({ settings, engine, provider = 'voicevox', onChange }: VoicevoxVoicePresetsProps) {
  const { t } = useTranslation(['factory', 'common'])
  const { toast } = useToast()
  const player = useAudioPlayer()
  const [editing, setEditing] = useState<VoicevoxVoicePreset | 'new' | null>(null)
  const [draft, setDraft] = useState<VoicevoxPresetPayload>(() => emptyDraft(settings.effectiveDefaultSpeaker))
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<VoicevoxVoicePreset | null>(null)
  const testText = SAMPLE_TEXT
  const [testing, setTesting] = useState<string | null>(null)

  const { presets, defaultPresetId } = settings
  const engineUp = engine?.available ?? false

  const speakerOptions = voicevoxSpeakerOptions(engine)
  const speakerLabel = (id: number) => speakerOptions.find((option) => option.value === String(id))?.label

  function openNew() {
    setDraft(emptyDraft(settings.effectiveDefaultSpeaker))
    setEditing('new')
  }

  function openEdit(preset: VoicevoxVoicePreset) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = preset
    setDraft(rest)
    setEditing(preset)
  }

  function close() {
    player.stop()
    setEditing(null)
  }

  async function speak(id: string, payload: Parameters<typeof synthesizeSpeech>[0]) {
    if (player.playingId === id) return player.stop()
    setTesting(id)
    try {
      const blob = await synthesizeSpeech(payload)
      player.play(id, URL.createObjectURL(blob), true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setTesting(null)
    }
  }

  async function save() {
    if (!draft.name.trim()) return
    setSaving(true)
    const payload = { ...draft, name: draft.name.trim(), speakerName: speakerLabel(draft.speaker) ?? draft.speakerName }
    try {
      if (editing === 'new') {
        const { item } = await createVoicevoxPreset(payload, provider)
        onChange({ presets: [...presets, item], defaultPresetId: defaultPresetId ?? item.id })
      } else if (editing) {
        const { item } = await updateVoicevoxPreset(editing.id, payload, provider)
        onChange({ presets: presets.map((preset) => (preset.id === item.id ? item : preset)) })
      }
      toast.success(t('factory:settings.toast.saved'))
      close()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(preset: VoicevoxVoicePreset) {
    setBusyId(preset.id)
    try {
      await deleteVoicevoxPreset(preset.id, provider)
      const rest = presets.filter((item) => item.id !== preset.id)
      onChange({
        presets: rest,
        defaultPresetId: defaultPresetId === preset.id ? (rest[0]?.id ?? null) : defaultPresetId,
      })
      setPendingDelete(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function makeDefault(preset: VoicevoxVoicePreset) {
    setBusyId(preset.id)
    try {
      const { item } = await setDefaultVoicevoxPreset(preset.id, provider)
      onChange({ defaultPresetId: item[provider].defaultPresetId })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('factory:settings.voice.preset.title')}
        </span>
        <Button size="sm" onClick={openNew} disabled={!engineUp}>
          <Plus className="size-4" />
          {t('factory:settings.voice.preset.add')}
        </Button>
      </div>

      {presets.length ? (
        <div className="space-y-2">
          {presets.map((preset) => {
            const isDefault = preset.id === defaultPresetId
            const busy = busyId === preset.id
            return (
              <div
                key={preset.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{preset.name}</span>
                    {isDefault ? (
                      <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-semibold text-primary-400">
                        {t('factory:settings.voice.preset.default')}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {speakerLabel(preset.speaker) ?? preset.speakerName} · {t('factory:settings.voice.vvp.speedScale').toLowerCase()}{' '}
                    {preset.speedScale} · {t('factory:settings.voice.vvp.pitchScale').toLowerCase()} {preset.pitchScale} · {t('factory:settings.voice.vvp.intonationScale').toLowerCase()}{' '}
                    {preset.intonationScale}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('factory:settings.voice.play')}
                    disabled={!engineUp || (testing !== null && testing !== preset.id)}
                    onClick={() =>
                      void speak(preset.id, { provider, text: testText.trim() || SAMPLE_TEXT, presetId: preset.id })
                    }
                  >
                    {testing === preset.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : player.playingId === preset.id ? (
                      <Square className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('factory:settings.voice.preset.setDefault')}
                    disabled={busy || isDefault}
                    onClick={() => void makeDefault(preset)}
                  >
                    <Star className={isDefault ? 'size-4 fill-primary-400 text-primary-400' : 'size-4'} />
                  </Button>
                  <Button size="sm" variant="ghost" title={t('factory:settings.voice.preset.edit')} disabled={busy} onClick={() => openEdit(preset)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title={t('factory:settings.voice.preset.delete')} disabled={busy} onClick={() => setPendingDelete(preset)}>
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {provider === 'aivisspeech'
            ? t(engineUp ? 'factory:settings.voice.aivis.empty' : 'factory:settings.voice.aivis.needEngine')
            : t(engineUp ? 'factory:settings.voice.vvp.empty' : 'factory:settings.voice.vvp.needEngine')}
        </p>
      )}

      <ConfirmDeleteModal
        open={pendingDelete !== null}
        title={t('factory:settings.voice.preset.delete')}
        name={pendingDelete?.name ?? ''}
        message={t('factory:settings.voice.preset.deleteMessage')}
        deleting={pendingDelete !== null && busyId === pendingDelete.id}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
      />

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? t('factory:settings.voice.preset.add') : t('factory:settings.voice.preset.edit')}
        className="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outlined" size="sm" onClick={close} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('factory:settings.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label={t('factory:settings.voice.preset.name')}>
            <Input
              className="h-10"
              autoFocus
              maxLength={100}
              placeholder={t('factory:settings.voice.vvp.namePlaceholder')}
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>

          <VoicevoxVoiceEditor
            draft={draft}
            engine={engine}
            provider={provider}
            onChange={(patch) =>
              setDraft((prev) => ({
                ...prev,
                ...patch,
                // First voice picked names the preset, unless the producer already typed a name.
                name: prev.name.trim() || !patch.speakerName ? prev.name : patch.speakerName.replace(/\s*\(#\d+\)$/, ''),
              }))
            }
          />
        </div>
      </Modal>
    </div>
  )
}
