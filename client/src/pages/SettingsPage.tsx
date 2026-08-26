import { useState } from 'react';
import { fetchAppSettings, updateAppSettings } from '../api/appSettings';
import { Button, Input, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import { cn } from '../lib/cn';
import type { AppSettings, SettingsTab } from '../types/appSettings';

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'video-ai', label: 'Video AI' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'video', label: 'Video' },
];

const EMPTY_SETTINGS: AppSettings = {
  enableKenBurns: true,
  enableImageTransitions: true,
  chromeBackgroundUseOffscreen: true,
  aiSceneDensityMaxSec: { high: 8, medium: 30, low: 60 },
};

function SettingCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-200">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-neutral-500">{description}</p> : null}
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="size-4 shrink-0 rounded border-border bg-surface accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

export function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('video-ai');
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useAbortableEffect(
    async signal => {
      setLoading(true);
      try {
        const { item } = await fetchAppSettings({ signal });
        if (!signal.aborted) setSettings(item);
      } catch (err) {
        if (!signal.aborted) {
          toast.error(err instanceof Error ? err.message : 'Không tải được cài đặt');
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  async function handleSave() {
    setSaving(true);
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
      });
      setSettings(item);
      toast.success('Đã lưu cài đặt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lưu cài đặt thất bại');
    } finally {
      setSaving(false);
    }
  }

  function setDensity(key: 'high' | 'medium' | 'low', value: string) {
    const parsed = Number(value);
    setSettings(prev => ({
      ...prev,
      aiSceneDensityMaxSec: {
        ...prev.aiSceneDensityMaxSec,
        [key]: Number.isFinite(parsed) ? parsed : prev.aiSceneDensityMaxSec[key],
      },
    }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-neutral-50">Cài đặt</h1>
        </div>

        <div className="mt-4 flex gap-6 border-b border-border">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative pb-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-primary-400'
                  : 'text-neutral-400 hover:text-neutral-200',
              )}
            >
              {tab.label}
              {activeTab === tab.id ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-400" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Đang tải...</p>
      ) : (
        <div className="space-y-6">
          {activeTab === 'video-ai' ? (
            <section className="space-y-3">
              <p className="text-sm text-neutral-400">
                Hiệu ứng ảnh cho dạng video AI (slideshow).
              </p>
              <SettingCheckbox
                id="enable-ken-burns"
                label="Ken Burns (pan/zoom)"
                description="Bật hiệu ứng pan/zoom trên từng ảnh trong slideshow."
                checked={settings.enableKenBurns}
                onChange={enableKenBurns => setSettings(prev => ({ ...prev, enableKenBurns }))}
                disabled={saving}
              />
              <SettingCheckbox
                id="enable-image-transitions"
                label="Chuyển cảnh giữa ảnh"
                description="Bật transition (xfade) giữa các ảnh; tắt thì cắt cứng."
                checked={settings.enableImageTransitions}
                onChange={enableImageTransitions =>
                  setSettings(prev => ({ ...prev, enableImageTransitions }))
                }
                disabled={saving}
              />
            </section>
          ) : null}

          {activeTab === 'chrome' ? (
            <section className="space-y-3">
              <p className="text-sm text-neutral-400">
                Cách giữ cửa sổ Chrome chạy nền khi automation.
              </p>
              <SettingCheckbox
                id="chrome-background-offscreen"
                label="Đưa cửa sổ Chrome nền ra ngoài màn hình"
                description="Bật: đỗ cửa sổ off-screen. Tắt: minimize (có thể làm viewport bị thu nhỏ)."
                checked={settings.chromeBackgroundUseOffscreen}
                onChange={chromeBackgroundUseOffscreen =>
                  setSettings(prev => ({ ...prev, chromeBackgroundUseOffscreen }))
                }
                disabled={saving}
              />
            </section>
          ) : null}

          {activeTab === 'video' ? (
            <section className="space-y-3">
              <p className="text-sm text-neutral-400">
                Thời lượng tối đa mỗi cảnh (giây) — mặc định toàn hệ thống. Kênh YouTube vẫn có thể
                ghi đè riêng.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-400">Đầu video</span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10 rounded-lg"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.high}
                    onChange={e => setDensity('high', e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-400">Giữa video</span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10 rounded-lg"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.medium}
                    onChange={e => setDensity('medium', e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-400">Cuối video</span>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="h-10 rounded-lg"
                    disabled={saving}
                    value={settings.aiSceneDensityMaxSec.low}
                    onChange={e => setDensity('low', e.target.value)}
                  />
                </label>
              </div>
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
              onClick={() => setRefreshKey(k => k + 1)}
            >
              Đặt lại
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
