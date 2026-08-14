import { useState } from 'react';
import { Button, Input, Textarea } from '../ui';
import { PlatformLinkCell } from './PlatformLinkCell';
import type { MailAccount, PlatformLinkStatus } from '../../types/mailAccount';

interface MailAccountDetailPanelProps {
  account: MailAccount | null;
  loading?: boolean;
  onClose: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value || value === 'None') return;
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
      title={copied ? 'Đã sao chép!' : 'Sao chép'}
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
      {children}
    </label>
  );
}

function PlatformRow({ label, status }: { label: string; status: PlatformLinkStatus }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <PlatformLinkCell status={status} />
    </div>
  );
}

export function MailAccountDetailPanel({ account, loading, onClose }: MailAccountDetailPanelProps) {
  if (!account && !loading) return null;

  if (loading) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-surface lg:w-80 xl:w-96">
        <div className="flex h-full flex-col p-4 animate-pulse space-y-4">
          <div className="h-6 w-3/4 rounded bg-neutral-800" />
          <div className="h-4 w-1/2 rounded bg-neutral-800" />
          <div className="h-10 rounded bg-neutral-800" />
          <div className="h-10 rounded bg-neutral-800" />
          <div className="h-20 rounded bg-neutral-800" />
        </div>
      </aside>
    );
  }

  if (!account) return null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface shadow-xl lg:w-80 lg:shadow-none xl:w-96">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="flex items-start gap-2 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-neutral-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <p className="truncate text-sm font-medium text-neutral-100">{account.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-neutral-500 hover:text-neutral-200"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <FieldLabel>Mục đích</FieldLabel>
            <Input
              readOnly
              value={account.purpose}
              className="h-9 rounded-lg text-sm"
            />
          </div>

          <div>
            <FieldLabel>Email khôi phục</FieldLabel>
            <div className="relative">
              <Input
                readOnly
                value={account.recoveryEmail}
                className="h-9 rounded-lg pr-10 text-sm font-mono"
              />
              <CopyButton value={account.recoveryEmail} />
            </div>
          </div>

          <div>
            <FieldLabel>Số điện thoại</FieldLabel>
            <div className="relative">
              <Input
                readOnly
                value={account.phone ?? ''}
                placeholder="—"
                className="h-9 rounded-lg pr-10 text-sm"
              />
              {account.phone ? <CopyButton value={account.phone} /> : null}
            </div>
          </div>

          {account.twoFactorAuth ? (
            <div>
              <FieldLabel>2FA</FieldLabel>
              <div className="relative">
                <Input
                  readOnly
                  value={account.twoFactorAuth}
                  className="h-9 rounded-lg pr-10 text-sm font-mono"
                />
                <CopyButton value={account.twoFactorAuth} />
              </div>
            </div>
          ) : null}

          <div>
            <FieldLabel>Nền tảng</FieldLabel>
            <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/50 p-3">
              <PlatformRow label="Youtube" status={account.platformLinks.youtube} />
              <PlatformRow label="TikTok" status={account.platformLinks.tiktok} />
              <PlatformRow label="Facebook" status={account.platformLinks.facebook} />
            </div>
          </div>

          <div>
            <FieldLabel>Ghi chú</FieldLabel>
            <Textarea
              readOnly
              rows={4}
              value={account.notes ?? ''}
              className="text-sm text-neutral-300"
            />
          </div>
        </div>

        <div className="border-t border-border p-4 space-y-2">
          <Button className="w-full rounded-lg">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
            Sửa chi tiết
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" size="sm" className="rounded-lg">
              Nhân bản
            </Button>
            <Button variant="outlined" size="sm" className="rounded-lg text-danger border-danger/30 hover:bg-danger/10">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Lưu trữ
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
