import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, KeyRound, Loader2, Mic, RefreshCw, Trash2, XCircle } from 'lucide-react'
import {
  addElevenLabsKey,
  checkAllElevenLabsKeys,
  checkElevenLabsKey,
  deleteElevenLabsKey,
  fetchElevenLabsModels,
  fetchElevenLabsVoices,
  fetchVoiceSettings,
  fetchVoicevoxEngineStatus,
  updateElevenLabsKey,
  updateVoiceSettings,
} from '../../api/voice'
import { useAbortableEffect } from '../../hooks'
import type {
  ElevenLabsKey,
  ElevenLabsModel,
  ElevenLabsVoice,
  VoicevoxEngineStatus,
  VoiceSettings,
} from '../../types/voice'
import { Button, DropdownSelect, Input, StatusBadge, Switch, Tooltip, TooltipProvider, useToast } from '../ui'
import { ElevenLabsVoicePresets } from './ElevenLabsVoicePresets'
import { VoicevoxVoicePresets } from './VoicevoxVoicePresets'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { appLocale } from '../../utils/locale'


const OUTPUT_FORMATS = ['mp3_44100_128', 'mp3_44100_192', 'mp3_22050_32', 'pcm_24000', 'pcm_44100']

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function Card({ title, icon, actions, children }: { title: string; icon: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-elevated/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </label>
  )
}

function KeyRow({
  item,
  busy,
  onToggle,
  onCheck,
  onDelete,
}: {
  item: ElevenLabsKey
  busy: boolean
  onToggle: (enabled: boolean) => void
  onCheck: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('factory')
  const limit = item.characterLimit ?? 0
  const used = item.characterCount ?? 0
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const tone = item.status === 'ok' ? 'success' : item.status === 'quota_exceeded' ? 'warning' : item.status ? 'danger' : 'neutral'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{item.maskedKey}</code>
          {item.tier ? <span className="text-[11px] uppercase text-muted-foreground">{item.tier}</span> : null}
          <StatusBadge
            label={t(`settings.voice.keyStatus.${item.status ?? 'unknown'}`)}
            tone={tone as 'success' | 'warning' | 'danger' | 'neutral'}
            withDot
          />
        </div>
        {limit > 0 ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className={pct >= 90 ? 'h-full bg-danger' : pct >= 70 ? 'h-full bg-warning' : 'h-full bg-primary-500'}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {used.toLocaleString(appLocale())} / {limit.toLocaleString(appLocale())} ({t('settings.voice.charsLeft', { count: Math.max(0, limit - used) })})
            </span>
          </div>
        ) : null}
        {item.statusMessage ? (
          <p className={`line-clamp-2 text-[11px] ${item.status === 'ok' ? 'text-muted-foreground' : 'text-danger'}`}>
            {item.statusMessage}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[11px] ${item.enabled ? 'text-success' : 'text-muted-foreground'}`}>
          {item.enabled ? t('settings.voice.enabled') : t('settings.voice.disabled')}
        </span>
        <Switch checked={item.enabled} onCheckedChange={onToggle} disabled={busy} aria-label={t('settings.voice.enabled')} />
        <Button size="sm" variant="ghost" onClick={onCheck} disabled={busy} title={t('settings.voice.checkKey')}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} title={t('settings.voice.deleteKey')}>
          <Trash2 className="size-4 text-danger" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Settings → Voice: VOICEVOX Engine connection + default speaker, ElevenLabs API keys (a pool the
 * server rotates through when one runs out of quota) and the saved voices of each provider.
 */
export function VoiceSettingsSection() {
  const { t } = useTranslation(['factory', 'common'])
  const { toast } = useToast()
  const [settings, setSettings] = useState<VoiceSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingPart, setSavingPart] = useState<'voicevox' | null>(null)

  // VOICEVOX
  const [vvUrl, setVvUrl] = useState('')
  const [vvStatus, setVvStatus] = useState<VoicevoxEngineStatus | null>(null)
  const [vvChecking, setVvChecking] = useState(false)

  // ElevenLabs
  const [newKey, setNewKey] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [pendingDeleteKey, setPendingDeleteKey] = useState<ElevenLabsKey | null>(null)
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [models, setModels] = useState<ElevenLabsModel[]>([])
  const [elLoading, setElLoading] = useState(false)
  const [elError, setElError] = useState<string | null>(null)


  function applySettings(item: VoiceSettings) {
    setSettings(item)
    setVvUrl(item.voicevox.url)
  }

  useAbortableEffect(async (signal) => {
    try {
      const [{ item }, status] = await Promise.all([
        fetchVoiceSettings({ signal }),
        fetchVoicevoxEngineStatus({ signal }).catch(() => null),
      ])
      if (signal.aborted) return
      applySettings(item)
      setVvStatus(status)
    } catch (err) {
      if (!signal.aborted) setLoadError(errorMessage(err))
    }
  }, [])

  const activeKeyCount = settings?.elevenlabs.keys.filter((key) => key.enabled).length ?? 0

  async function loadElevenLabsCatalog() {
    setElLoading(true)
    setElError(null)
    try {
      const [voiceRes, modelRes] = await Promise.all([fetchElevenLabsVoices(), fetchElevenLabsModels()])
      setVoices(voiceRes.items)
      setModels(modelRes.items)
    } catch (err) {
      setElError(errorMessage(err))
    } finally {
      setElLoading(false)
    }
  }

  useEffect(() => {
    if (activeKeyCount > 0 && voices.length === 0 && !elLoading) void loadElevenLabsCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeyCount])

  function replaceKey(next: ElevenLabsKey) {
    setSettings((prev) =>
      prev
        ? { ...prev, elevenlabs: { ...prev.elevenlabs, keys: prev.elevenlabs.keys.map((k) => (k.id === next.id ? next : k)) } }
        : prev,
    )
  }

  async function checkVoicevox() {
    setVvChecking(true)
    try {
      setVvStatus(await fetchVoicevoxEngineStatus())
    } finally {
      setVvChecking(false)
    }
  }

  async function saveVoicevox() {
    setSavingPart('voicevox')
    try {
      const { item } = await updateVoiceSettings({ voicevox: { url: vvUrl.trim() } })
      applySettings(item)
      toast.success(t('factory:settings.toast.saved'))
      void checkVoicevox()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingPart(null)
    }
  }

  async function saveOutputFormat(outputFormat: string) {
    const previous = settings?.elevenlabs.outputFormat
    patchElevenLabs({ outputFormat })
    try {
      await updateVoiceSettings({ elevenlabs: { outputFormat } })
    } catch (err) {
      if (previous) patchElevenLabs({ outputFormat: previous })
      toast.error(errorMessage(err))
    }
  }

  function patchElevenLabs(patch: Partial<VoiceSettings['elevenlabs']>) {
    setSettings((prev) => (prev ? { ...prev, elevenlabs: { ...prev.elevenlabs, ...patch } } : prev))
  }

  async function handleAddKey() {
    if (!newKey.trim()) return
    setAdding(true)
    try {
      const { item } = await addElevenLabsKey({ apiKey: newKey.trim() })
      setSettings((prev) =>
        prev ? { ...prev, elevenlabs: { ...prev.elevenlabs, keys: [...prev.elevenlabs.keys, item] } } : prev,
      )
      setNewKey('')
      toast.success(t('factory:settings.voice.keyAdded'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  async function runOnKey(id: string, action: () => Promise<void>) {
    setBusyKeyId(id)
    try {
      await action()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyKeyId(null)
    }
  }

  function handleDeleteKey(key: ElevenLabsKey) {
    void runOnKey(key.id, async () => {
      await deleteElevenLabsKey(key.id)
      setSettings((prev) =>
        prev
          ? { ...prev, elevenlabs: { ...prev.elevenlabs, keys: prev.elevenlabs.keys.filter((k) => k.id !== key.id) } }
          : prev,
      )
      setPendingDeleteKey(null)
    })
  }

  async function handleCheckAll() {
    setCheckingAll(true)
    try {
      const { items } = await checkAllElevenLabsKeys()
      setSettings((prev) => (prev ? { ...prev, elevenlabs: { ...prev.elevenlabs, keys: items } } : prev))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setCheckingAll(false)
    }
  }

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>
  if (!settings) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('factory:settings.voice.hint')}</p>

      {/* ElevenLabs */}
      <Card
        title="ElevenLabs"
        icon={<KeyRound className="size-4 text-primary-400" />}
        actions={
          settings.elevenlabs.keys.length ? (
            <Button size="sm" variant="outlined" onClick={handleCheckAll} disabled={checkingAll}>
              {checkingAll ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {t('factory:settings.voice.checkAll')}
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            type="password"
            autoComplete="off"
            placeholder={t('factory:settings.voice.keyPlaceholder')}
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleAddKey()
            }}
            disabled={adding}
            className="h-10"
          />
          <Button onClick={handleAddKey} disabled={adding || newKey.trim().length < 10}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('factory:settings.voice.addKey')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('factory:settings.voice.keyHint')}</p>

        {settings.elevenlabs.keys.length ? (
          <div className="space-y-2">
            {settings.elevenlabs.keys.map((key) => (
              <KeyRow
                key={key.id}
                item={key}
                busy={busyKeyId === key.id || checkingAll}
                onToggle={(enabled) =>
                  void runOnKey(key.id, async () => replaceKey((await updateElevenLabsKey(key.id, { enabled })).item))
                }
                onCheck={() => void runOnKey(key.id, async () => replaceKey((await checkElevenLabsKey(key.id)).item))}
                onDelete={() => setPendingDeleteKey(key)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {t('factory:settings.voice.noKeys')}
          </p>
        )}

        <ElevenLabsVoicePresets
          settings={settings.elevenlabs}
          voices={voices}
          models={models}
          catalogLoading={elLoading}
          catalogError={elError}
          canUseApi={activeKeyCount > 0}
          onReloadCatalog={() => void loadElevenLabsCatalog()}
          onChange={patchElevenLabs}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            {t('factory:settings.voice.el.outputFormat')}
            <TooltipProvider>
              <Tooltip
                side="right"
                className="max-w-sm p-3"
                content={
                  <div className="space-y-2">
                    <p className="text-muted-foreground">{t('factory:settings.voice.format.intro')}</p>
                    <ul className="space-y-1.5">
                      {OUTPUT_FORMATS.map((format) => (
                        <li key={format}>
                          <code className="font-semibold text-foreground">{format}</code>
                          <span className="text-muted-foreground"> — {t(`factory:settings.voice.format.items.${format}`)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-warning">{t('factory:settings.voice.format.tierNote')}</p>
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label={t('factory:settings.voice.format.intro')}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info className="size-3.5" />
                </button>
              </Tooltip>
            </TooltipProvider>
          </span>
          <DropdownSelect
            value={settings.elevenlabs.outputFormat}
            options={OUTPUT_FORMATS.map((value) => ({ value, label: value }))}
            onChange={(outputFormat) => void saveOutputFormat(outputFormat)}
            triggerClassName="h-9 w-48 rounded-lg text-sm"
          />
        </div>
      </Card>

      {/* VOICEVOX */}
      <Card
        title="VOICEVOX"
        icon={<Mic className="size-4 text-primary-400" />}
        actions={
          <div className="flex items-center gap-2">
            {vvStatus?.available ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="size-4" />
                {t('factory:settings.voice.connected')}
                {vvStatus.version ? ` · v${vvStatus.version}` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-danger">
                <XCircle className="size-4" />
                {t('factory:settings.voice.disconnected')}
              </span>
            )}
            <Button size="sm" variant="outlined" onClick={checkVoicevox} disabled={vvChecking}>
              {vvChecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {t('factory:settings.voice.checkConnection')}
            </Button>
          </div>
        }
      >
        {vvStatus && !vvStatus.available && vvStatus.error ? (
          <p className="text-xs text-danger">{vvStatus.error}</p>
        ) : null}
        <Field
          label={t('factory:settings.voice.vv.url')}
          hint={t('factory:settings.voice.vv.urlHint', { url: settings.voicevox.effectiveUrl })}
        >
          <div className="flex gap-2">
            <Input
              className="h-9 min-w-0 flex-1"
              placeholder="http://127.0.0.1:50021"
              value={vvUrl}
              onChange={(event) => setVvUrl(event.target.value)}
            />
            <Button size="sm" className="h-9 shrink-0" onClick={saveVoicevox} disabled={savingPart !== null}>
              {savingPart === 'voicevox' ? t('factory:settings.saving') : t('factory:settings.save')}
            </Button>
          </div>
        </Field>

        <VoicevoxVoicePresets
          settings={settings.voicevox}
          engine={vvStatus}
          onChange={(patch) =>
            setSettings((prev) => (prev ? { ...prev, voicevox: { ...prev.voicevox, ...patch } } : prev))
          }
        />
      </Card>

      <ConfirmDeleteModal
        open={pendingDeleteKey !== null}
        title={t('factory:settings.voice.deleteKey')}
        name={pendingDeleteKey?.maskedKey ?? ''}
        message={t('factory:settings.voice.deleteKeyMessage')}
        deleting={pendingDeleteKey !== null && busyKeyId === pendingDeleteKey.id}
        onClose={() => setPendingDeleteKey(null)}
        onConfirm={() => pendingDeleteKey && handleDeleteKey(pendingDeleteKey)}
      />
    </div>
  )
}
