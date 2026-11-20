import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Play, Plus, RefreshCw, Square, Star, Trash2 } from 'lucide-react'
import {
  createVoicePreset,
  deleteVoicePreset,
  setDefaultVoicePreset,
  synthesizeSpeech,
  updateVoicePreset,
} from '../../api/voice'
import type {
  ElevenLabsModel,
  ElevenLabsVoice,
  ElevenLabsVoicePreset,
  VoicePresetPayload,
  VoiceSettings,
} from '../../types/voice'
import { Button, Input, Modal, useToast } from '../ui'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { ElevenLabsVoiceEditor, emptyElevenLabsDraft } from './ElevenLabsVoiceEditor'
import { Field, SAMPLE_TEXT, errorMessage, useAudioPlayer } from './voicePresetShared'

function emptyDraft(): VoicePresetPayload {
  return { name: '', ...emptyElevenLabsDraft() }
}

export interface ElevenLabsVoicePresetsProps {
  settings: VoiceSettings['elevenlabs']
  voices: ElevenLabsVoice[]
  models: ElevenLabsModel[]
  catalogLoading: boolean
  catalogError: string | null
  canUseApi: boolean
  onReloadCatalog: () => void
  onChange: (patch: Partial<Pick<VoiceSettings['elevenlabs'], 'presets' | 'defaultPresetId'>>) => void
}

/**
 * Saved ElevenLabs voices: "Thêm voice" picks a voice from the account's library, tunes its settings
 * and saves it under a name; the default one is used whenever a caller doesn't pick a voice.
 */
export function ElevenLabsVoicePresets({
  settings,
  voices,
  models,
  catalogLoading,
  catalogError,
  canUseApi,
  onReloadCatalog,
  onChange,
}: ElevenLabsVoicePresetsProps) {
  const { t } = useTranslation(['factory', 'common'])
  const { toast } = useToast()
  const player = useAudioPlayer()
  const [editing, setEditing] = useState<ElevenLabsVoicePreset | 'new' | null>(null)
  const [draft, setDraft] = useState<VoicePresetPayload>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ElevenLabsVoicePreset | null>(null)
  const testText = SAMPLE_TEXT
  const [testing, setTesting] = useState<string | null>(null)

  const { presets, defaultPresetId } = settings

  function openNew() {
    setDraft(emptyDraft())
    setEditing('new')
  }

  function openEdit(preset: ElevenLabsVoicePreset) {
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
    if (!draft.name.trim() || !draft.voiceId) return
    setSaving(true)
    try {
      if (editing === 'new') {
        const { item } = await createVoicePreset({ ...draft, name: draft.name.trim() })
        onChange({ presets: [...presets, item], defaultPresetId: defaultPresetId ?? item.id })
      } else if (editing) {
        const { item } = await updateVoicePreset(editing.id, { ...draft, name: draft.name.trim() })
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

  async function remove(preset: ElevenLabsVoicePreset) {
    setBusyId(preset.id)
    try {
      await deleteVoicePreset(preset.id)
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

  async function makeDefault(preset: ElevenLabsVoicePreset) {
    setBusyId(preset.id)
    try {
      const { item } = await setDefaultVoicePreset(preset.id)
      onChange({ defaultPresetId: item.elevenlabs.defaultPresetId })
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
        <div className="flex items-center gap-2">
          {canUseApi ? (
            <Button size="sm" variant="ghost" onClick={onReloadCatalog} disabled={catalogLoading}>
              {catalogLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {t('factory:settings.voice.reloadVoices')}
            </Button>
          ) : null}
          <Button size="sm" onClick={openNew} disabled={!canUseApi}>
            <Plus className="size-4" />
            {t('factory:settings.voice.preset.add')}
          </Button>
        </div>
      </div>
      {catalogError ? <p className="text-xs text-danger">{catalogError}</p> : null}

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
                    {voices.find((voice) => voice.voiceId === preset.voiceId)?.name ?? preset.voiceName} · {preset.modelId} · stab {preset.stability} · sim {preset.similarityBoost} · style{' '}
                    {preset.style} · {t('factory:settings.voice.el.speed').toLowerCase()} {preset.speed}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('factory:settings.voice.play')}
                    disabled={testing !== null && testing !== preset.id}
                    onClick={() => void speak(preset.id, { provider: 'elevenlabs', text: testText.trim() || SAMPLE_TEXT, presetId: preset.id })}
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
          {canUseApi ? t('factory:settings.voice.preset.empty') : t('factory:settings.voice.preset.needKey')}
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
            <Button size="sm" onClick={save} disabled={saving || !draft.name.trim() || !draft.voiceId}>
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
              placeholder={t('factory:settings.voice.preset.namePlaceholder')}
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>

          <ElevenLabsVoiceEditor
            draft={draft}
            onChange={(patch) =>
              setDraft((prev) => ({
                ...prev,
                ...patch,
                // First voice picked names the preset, unless the producer already typed a name.
                name: prev.name.trim() || !patch.voiceName ? prev.name : patch.voiceName,
              }))
            }
            voices={voices}
            models={models}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            canUseApi={canUseApi}
            onReloadCatalog={onReloadCatalog}
          />
        </div>
      </Modal>
    </div>
  )
}
