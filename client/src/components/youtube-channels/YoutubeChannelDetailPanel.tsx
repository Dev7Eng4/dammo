import { useState } from 'react';
import { Button, Input } from '../ui';
import { formatChannelUploadSchedule } from '../../constants/youtubeChannelForm';
import { formatChannelLanguageLabel, type YoutubeChannel } from '../../types/youtubeChannel';
import { ChannelStatusPill } from './ChannelStatusPill';
import { MonetizationPill } from './MonetizationPill';

interface YoutubeChannelDetailPanelProps {
  channel: YoutubeChannel | null;
  loading?: boolean;
  onClose: () => void;
}

function CopyButton({ value }: { value: string }) {
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
      title={copied ? 'Copied!' : 'Copy'}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">{children}</h3>
  );
}

export function YoutubeChannelDetailPanel({ channel, loading, onClose }: YoutubeChannelDetailPanelProps) {
  if (!channel && !loading) return null;

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

  if (!channel) return null;

  const initial = channel.name.charAt(0).toUpperCase();

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface shadow-xl lg:w-80 lg:shadow-none xl:w-96">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-sm font-semibold text-neutral-300">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-100">{channel.name}</p>
              <p className="truncate text-xs text-neutral-500">{channel.handle}</p>
              <a
                href={channel.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block truncate text-xs text-secondary-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {channel.youtubeUrl.replace('https://', '')}
              </a>
            </div>
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

        <div className="flex flex-wrap gap-2 px-4 pt-3">
          <ChannelStatusPill status={channel.status} />
          <MonetizationPill status={channel.monetizationStatus} />
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <Button variant="outlined" size="sm" className="flex-1 rounded-lg">
            Edit
          </Button>
          <Button size="sm" className="flex-1 rounded-lg">
            Sync Now
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <SectionTitle>Configuration</SectionTitle>
            <div className="space-y-3">
              <div>
                <FieldLabel>Linked Mail Account</FieldLabel>
                <div className="relative">
                  <Input
                    readOnly
                    value={channel.linkedEmail}
                    className="h-9 rounded-lg pr-10 text-sm font-mono"
                  />
                  <CopyButton value={channel.linkedEmail} />
                </div>
              </div>
              <div>
                <FieldLabel>Niche</FieldLabel>
                <Input readOnly value={channel.niche} className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <FieldLabel>Language</FieldLabel>
                <Input readOnly value={formatChannelLanguageLabel(channel.language)} className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>Operations</SectionTitle>
            <div className="space-y-3">
              <div>
                <FieldLabel>Upload Schedule</FieldLabel>
                <Input readOnly value={formatChannelUploadSchedule(channel)} className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <FieldLabel>Source Mapping</FieldLabel>
                <Input readOnly value={channel.sourceMapping} className="h-9 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <FieldLabel>Content Project</FieldLabel>
                <Input readOnly value={channel.contentProjectId} className="h-9 rounded-lg text-sm font-mono" />
              </div>
            </div>
          </div>

          {channel.notes ? (
            <div>
              <SectionTitle>Status &amp; Notes</SectionTitle>
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">Copyright Risk Note</p>
                <p className="mt-1 text-xs text-neutral-300">{channel.notes}</p>
              </div>
            </div>
          ) : null}

          {channel.recentActivity.length > 0 ? (
            <div>
              <SectionTitle>Recent Activity</SectionTitle>
              <ul className="space-y-2">
                {channel.recentActivity.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                    <span className="shrink-0 font-mono text-neutral-500">{entry.at}</span>
                    <span className="text-neutral-300">{entry.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
