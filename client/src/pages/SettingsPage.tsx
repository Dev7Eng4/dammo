import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import { fetchAppSettings, updateAppSettings } from '../api/appSettings'
import { PageHeader, PageShell } from '../components/layout'
import { Button, Input, PageTabs, Select, Switch, useToast } from '../components/ui'
import { useAbortableEffect } from '../hooks'
import type { AppSettings, AiScenePromptChromeProfileRole, SettingsTab } from '../types/appSettings'

const EMPTY_SETTINGS: AppSettings = {
  enableKenBurns: true,
  enableImageTransitions: true,
  chromeBackgroundUseOffscreen: true,
  aiSceneDensityMaxSec: { high: 8, medium: 30, low: 60 },
  taskQueueConcurrency: 1,
  verboseVideoLogs: true,
  aiScenePromptChromeProfileRole: 'main',
  aiScenePromptConcurrency: 1,
  checkPromptFillLength: true,
}

function SettingSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation('factory')
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('video-ai')
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'video-ai', label: t('settings.tab.videoAi') },
    { id: 'chrome', label: t('settings.tab.chrome') },
    { id: 'video', label: t('settings.tab.video') },
    { id: 'task-queue', label: t('settings.tab.taskQueue') },
  ]

  useAbortableEffect(async (signal) => {
    setLoading(true)
    try {
      const { item } = await fetchAppSettings({ signal })
      if (!signal.aborted) {
        setSettings({
          ...EMPTY_SETTINGS,
          ...item,
          aiSceneDensityMaxSec: {
            ...EMPTY_SETTINGS.aiSceneDensityMaxSec,
            ...item.aiSceneDensityMaxSec,
          },
          aiScenePromptChromeProfileRole:
            item.aiScenePromptChromeProfileRole === 'sub' ? 'sub' : 'main',
          aiScenePromptConcurrency: Math.min(
            8,
            Math.max(1, Math.round(Number(item.aiScenePromptConcurrency)) || 1),
          ),
        })
      }
    } catch (err) {
      if (!signal.aborted) {
        toast.error(err instanceof Error ? err.message : t('settings.toast.loadError'))
      }
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [refreshKey])

  async function handleSave() {
    setSaving(true)
    try {
      const { item } = await updateAppSettings({
        enableKenBurns: settings.enableKenBurns,
        enableImageTransitions: settings.enableImageTransitions,
        chromeBackgroundUseOffscreen: settings.chromeBackgroundUseOffscreen,
        aiSceneDensityMaxSec: {
          high: Math.round(Number(settings.aiSceneDensityMaxSec.high)) || 8,
          medium: Math.round(Number(settings.aiSceneDensityMaxSec.medium)) || 30,
          low: Math.round(Number(settings.aiSceneDensityMaxSec.low)) || 60,
        },
        taskQueueConcurrency: Math.min(
          8,
          Math.max(1, Math.round(Number(settings.taskQueueConcurrency)) || 1),
        ),
        verboseVideoLogs: settings.verboseVideoLogs,
        aiScenePromptChromeProfileRole: settings.aiScenePromptChromeProfileRole,
        aiScenePromptConcurrency: Math.min(
          8,
          Math.max(1, Math.round(Number(settings.aiScenePromptConcurrency)) || 1),
        ),
        checkPromptFillLength: settings.checkPromptFillLength,
      })
      setSettings(item)
      toast.success(t('settings.toast.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function setDensity(key: 'high' | 'medium' | 'low', value: string) {
    const parsed = Number(value)
    setSettings((prev) => ({
      ...prev,
      aiSceneDensityMaxSec: {
        ...prev.aiSceneDensityMaxSec,
        [key]: Number.isFinite(parsed) ? parsed : prev.aiSceneDensityMaxSec[key],
      },
    }))
  }

  return (
    <PageShell>
      <PageHeader
        title={t('settings.page.title')}
        subtitle={t('settings.page.subtitle')}
        icon={Settings}
      />

      <PageTabs
        variant="pill"
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SettingsTab)}
        items={tabs}
      />

      {loading ? (
        <div className="card-surface space-y-3 p-5">
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <div className="card-surface space-y-6 p-5">
          {activeTab === 'video-ai' ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('settings.videoAi.hint')}</p>
              <SettingSwitch
                id="enable-ken-burns"
                label={t('settings.kenBurns')}
                description={t('settings.kenBurnsDesc')}
                checked={settings.enableKenBurns}
                onChange={(enableKenBurns) => setSettings((prev) => ({ ...prev, enableKenBurns }))}
                disabled={saving}
              />
              <SettingSwitch
                id="enable-image-transitions"
                label={t('settings.transitions')}
                description={t('settings.transitionsDesc')}
                checked={settings.enableImageTransitions}
                onChange={(enableImageTransitions) =>
                  setSettings((prev) => ({ ...prev, enableImageTransitions }))
                }
                disabled={saving}
              />
            </section>
          ) : null}

          {activeTab === 'chrome' ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('settings.chrome.hint')}</p>
              <SettingSwitch
                id="chrome-background-offscreen"
                label={t('settings.chromeOffscreen')}
                description={t('settings.chromeOffscreenDesc')}
                checked={settings.chromeBackgroundUseOffscreen}
                onChange={(chromeBackgroundUseOffscreen) =>
                  setSettings((prev) => ({ ...prev, chromeBackgroundUseOffscreen }))
                }
                disabled={saving}
              />
              <SettingSwitch
                id="check-prompt-fill-length"
                label={t('settings.checkPromptFillLength')}
                description={t('settings.checkPromptFillLengthDesc')}
                checked={settings.checkPromptFillLength}
                onChange={(checkPromptFillLength) =>
                  setSettings((prev) => ({ ...prev, checkPromptFillLength }))
                }
                disabled={saving}
              />
              <div className="space-y-1.5 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
                <label htmlFor="scene-prompt-chrome-profile" className="text-sm font-medium text-foreground">
                  {t('settings.scenePromptProfile')}
                </label>
                <p className="text-xs text-muted-foreground">{t('settings.scenePromptProfileDesc')}</p>
                <Select
                  id="scene-prompt-chrome-profile"
                  disabled={saving || settings.aiScenePromptConcurrency > 1}
                  value={settings.aiScenePromptChromeProfileRole}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      aiScenePromptChromeProfileRole: value as AiScenePromptChromeProfileRole,
                    }))
                  }
                  options={[
                    { value: 'main', label: t('settings.scenePromptProfileMain') },
                    { value: 'sub', label: t('settings.scenePromptProfileSub') },
                  ]}
                />
                {settings.aiScenePromptConcurrency > 1 ? (
                  <p className="text-xs text-muted-foreground">{t('settings.scenePromptProfileParallelHint')}</p>
                ) : null}
              </div>
              <label className="block max-w-xs space-y-1.5 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {t('settings.scenePromptConcurrency')}
                </span>
                <p className="text-xs text-muted-foreground">{t('settings.scenePromptConcurrencyDesc')}</p>
                <Input
                  id="scene-prompt-concurrency"
                  type="number"
                  min={1}
                  max={8}
                  className="h-10"
                  disabled={saving}
                  value={settings.aiScenePromptConcurrency}
                  onChange={(e) => {
                    const parsed = Number(e.target.value)
                    setSettings((prev) => ({
                      ...prev,
                      aiScenePromptConcurrency: Number.isFinite(parsed)
                        ? parsed
                        : prev.aiScenePromptConcurrency,
                    }))
                  }}
                />
              </label>
            </section>
          ) : null}

          {activeTab === 'video' ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('settings.sceneDensity')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('settings.sceneStart')}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.high}
                    onChange={(e) => setDensity('high', e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('settings.sceneMiddle')}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.medium}
                    onChange={(e) => setDensity('medium', e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('settings.sceneEnd')}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.low}
                    onChange={(e) => setDensity('low', e.target.value)}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {activeTab === 'task-queue' ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('settings.concurrencyHint')}</p>
              <label className="block max-w-xs space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('settings.concurrency')}
                </span>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  className="h-10"
                  disabled={saving}
                  value={settings.taskQueueConcurrency}
                  onChange={(e) => {
                    const parsed = Number(e.target.value)
                    setSettings((prev) => ({
                      ...prev,
                      taskQueueConcurrency: Number.isFinite(parsed)
                        ? parsed
                        : prev.taskQueueConcurrency,
                    }))
                  }}
                />
              </label>
              <SettingSwitch
                id="verbose-video-logs"
                label={t('settings.verboseLogs')}
                description={t('settings.verboseLogsDesc')}
                checked={settings.verboseVideoLogs}
                onChange={(verboseVideoLogs) =>
                  setSettings((prev) => ({ ...prev, verboseVideoLogs }))
                }
                disabled={saving}
              />
            </section>
          ) : null}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? t('settings.saving') : t('settings.save')}
            </Button>
            <Button
              type="button"
              variant="outlined"
              disabled={saving || loading}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              {t('settings.reset')}
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
