import { useState } from 'react'
import { Settings } from 'lucide-react'
import { fetchAppSettings, updateAppSettings } from '../api/appSettings'
import { PageHeader, PageShell } from '../components/layout'
import { Button, Input, PageTabs, Switch, useToast } from '../components/ui'
import { useAbortableEffect } from '../hooks'
import type { AppSettings, SettingsTab } from '../types/appSettings'

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'video-ai', label: 'Video AI' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'video', label: 'Video' },
  { id: 'task-queue', label: 'Hàng đợi' },
]

const EMPTY_SETTINGS: AppSettings = {
  enableKenBurns: true,
  enableImageTransitions: true,
  chromeBackgroundUseOffscreen: true,
  aiSceneDensityMaxSec: { high: 8, medium: 30, low: 60 },
  taskQueueConcurrency: 1,
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
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('video-ai')
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useAbortableEffect(async (signal) => {
    setLoading(true)
    try {
      const { item } = await fetchAppSettings({ signal })
      if (!signal.aborted) setSettings(item)
    } catch (err) {
      if (!signal.aborted) {
        toast.error(err instanceof Error ? err.message : 'Không tải được cài đặt')
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
      })
      setSettings(item)
      toast.success('Đã lưu cài đặt')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lưu cài đặt thất bại')
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
        title="Cài đặt"
        subtitle="Cấu hình video AI, Chrome, mật độ cảnh và hàng đợi task."
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
              <p className="text-sm text-muted-foreground">Hiệu ứng ảnh cho dạng video AI (slideshow).</p>
              <SettingSwitch
                id="enable-ken-burns"
                label="Ken Burns (pan/zoom)"
                description="Bật hiệu ứng pan/zoom trên từng ảnh trong slideshow."
                checked={settings.enableKenBurns}
                onChange={(enableKenBurns) => setSettings((prev) => ({ ...prev, enableKenBurns }))}
                disabled={saving}
              />
              <SettingSwitch
                id="enable-image-transitions"
                label="Chuyển cảnh giữa ảnh"
                description="Bật transition (xfade) giữa các ảnh; tắt thì cắt cứng."
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
              <p className="text-sm text-muted-foreground">Cách giữ cửa sổ Chrome chạy nền khi automation.</p>
              <SettingSwitch
                id="chrome-background-offscreen"
                label="Đưa cửa sổ Chrome nền ra ngoài màn hình"
                description="Bật: đỗ cửa sổ ra ngoài màn hình khi chạy nền. Tắt: giữ cửa sổ hiển thị bình thường."
                checked={settings.chromeBackgroundUseOffscreen}
                onChange={(chromeBackgroundUseOffscreen) =>
                  setSettings((prev) => ({ ...prev, chromeBackgroundUseOffscreen }))
                }
                disabled={saving}
              />
            </section>
          ) : null}

          {activeTab === 'video' ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Thời lượng tối đa mỗi cảnh (giây) — mặc định toàn hệ thống. Kênh YouTube vẫn có thể ghi đè riêng.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Đầu video</span>
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
                  <span className="text-xs font-medium text-muted-foreground">Giữa video</span>
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
                  <span className="text-xs font-medium text-muted-foreground">Cuối video</span>
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
              <p className="text-sm text-muted-foreground">
                Số công việc trong hàng đợi được chạy đồng thời. Giá trị 1 = tuần tự (job sau chờ job trước xong).
              </p>
              <label className="block max-w-xs space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Số job chạy đồng thời</span>
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
            </section>
          ) : null}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              disabled={saving || loading}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Đặt lại
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
