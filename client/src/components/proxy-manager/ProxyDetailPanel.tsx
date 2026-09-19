import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../ui';
import { ProxyStatusPill } from './ProxyStatusPill';
import type { Proxy } from '../../types/proxy';

interface ProxyDetailPanelProps {
  proxy: Proxy | null;
  loading?: boolean;
  testing?: boolean;
  onClose: () => void;
  onTest: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
      {children}
    </label>
  );
}

function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? t('actions.copied') : t('actions.copy')}
      className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
    >
      {copied ? (
        <svg className="size-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function ProxyDetailPanel({
  proxy,
  loading,
  testing = false,
  onClose,
  onTest,
  onEdit,
  onArchive,
}: ProxyDetailPanelProps) {
  const { t } = useTranslation(['browser', 'common']);
  const [showPassword, setShowPassword] = useState(false);

  function formatLastChecked(iso?: string) {
    if (!iso) return t('proxy.detail.neverChecked');
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return t('proxy.detail.justNow');
    if (minutes < 60) return t('proxy.detail.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('proxy.detail.hoursAgo', { count: hours });
    return t('proxy.detail.daysAgo', { count: Math.floor(hours / 24) });
  }

  if (!proxy && !loading) return null;

  if (loading) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-surface lg:w-80 xl:w-96">
        <div className="flex h-full animate-pulse flex-col space-y-4 p-4">
          <div className="h-6 w-3/4 rounded bg-neutral-800" />
          <div className="h-4 w-1/2 rounded bg-neutral-800" />
          <div className="h-10 rounded bg-neutral-800" />
          <div className="h-10 rounded bg-neutral-800" />
          <div className="h-20 rounded bg-neutral-800" />
        </div>
      </aside>
    );
  }

  if (!proxy) return null;

  const hostPort = `${proxy.host}:${proxy.port}`;
  const authValue = proxy.username
    ? `${proxy.username}:${showPassword ? proxy.password ?? '' : '••••••••'}`
    : '—';

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface shadow-xl lg:w-80 lg:shadow-none xl:w-96">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-100">{proxy.name}</p>
            <p className="mt-0.5 text-xs uppercase text-neutral-500">{proxy.type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-neutral-500 hover:text-neutral-200"
            aria-label={t('common:aria.close')}
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <ProxyStatusPill status={proxy.status} />
          <span className="text-xs text-neutral-500">
            {t('proxy.detail.lastChecked', { time: formatLastChecked(proxy.lastCheckedAt) })}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              {t('proxy.detail.connection')}
            </p>
            <FieldLabel>{t('proxy.detail.hostPort')}</FieldLabel>
            <div className="relative">
              <Input readOnly value={hostPort} className="h-9 rounded-lg pr-10 font-mono text-sm" />
              <CopyButton value={hostPort} />
            </div>
            <div className="mt-3">
              <FieldLabel>{t('proxy.detail.auth')}</FieldLabel>
              <div className="relative">
                <Input readOnly value={authValue} className="h-9 rounded-lg pr-16 font-mono text-sm" />
                {proxy.password ? (
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-9 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    title={showPassword ? t('proxy.detail.hidePassword') : t('proxy.detail.showPassword')}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                ) : null}
                {proxy.username ? <CopyButton value={authValue} /> : null}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">{t('proxy.detail.meta')}</p>
            <div className="space-y-2 text-sm">
              <div>
                <FieldLabel>{t('proxy.detail.location')}</FieldLabel>
                <p className="text-neutral-300">{proxy.location ?? '—'}</p>
              </div>
              <div>
                <FieldLabel>{t('proxy.detail.provider')}</FieldLabel>
                <p className="text-neutral-300">{proxy.provider ?? '—'}</p>
              </div>
              {(proxy.tags?.length ?? 0) > 0 ? (
                <div>
                  <FieldLabel>{t('proxy.detail.tags')}</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {proxy.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                {t('proxy.detail.assignedProfiles', { count: proxy.assignedProfileIds.length })}
              </p>
            </div>
            {proxy.assignedProfileIds.length > 0 ? (
              <ul className="space-y-1 text-sm text-neutral-300">
                {proxy.assignedProfileIds.map((id) => (
                  <li key={id} className="rounded-lg border border-border px-3 py-2">
                    {id}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-neutral-500">
                {t('proxy.detail.noAssigned')}
              </p>
            )}
          </div>

          <div className="card-surface px-3 py-3">
            <FieldLabel>{t('proxy.detail.performance')}</FieldLabel>
            <p className="text-2xl font-semibold text-neutral-50">
              {proxy.latencyMs != null ? `${proxy.latencyMs}ms` : '—'}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">{t('proxy.detail.latencyHint')}</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-border p-4">
          <Button className="w-full rounded-lg" disabled={testing} onClick={onTest}>
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {testing ? t('proxy.detail.testing') : t('proxy.detail.testConnection')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" size="sm" className="rounded-lg" onClick={onEdit}>
              {t('common:actions.edit')}
            </Button>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
              onClick={onArchive}
              disabled={testing || proxy.assignedProfileIds.length > 0}
              title={
                proxy.assignedProfileIds.length > 0
                  ? t('proxy.detail.archiveDisabled', { count: proxy.assignedProfileIds.length })
                  : undefined
              }
            >
              {t('proxy.detail.archive')}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
