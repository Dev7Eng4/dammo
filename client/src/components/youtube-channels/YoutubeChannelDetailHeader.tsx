import { Link } from 'react-router-dom';
import { Button } from '../ui';
import { formatTargetAudienceLabel, YOUTUBE_CHANNEL_TYPE_LABELS, type YoutubeChannel } from '../../types/youtubeChannel';
import { ChannelStatusPill } from './ChannelStatusPill';
import { MonetizationPill } from './MonetizationPill';

interface YoutubeChannelDetailHeaderProps {
  channel: YoutubeChannel;
  syncing?: boolean;
  syncError?: string | null;
  creatingVideo?: boolean;
  canCreateVideo?: boolean;
  onSync?: () => void;
  onEdit?: () => void;
  onCreateVideo?: () => void;
}

export function YoutubeChannelDetailHeader({
  channel,
  syncing,
  syncError,
  creatingVideo,
  canCreateVideo,
  onSync,
  onEdit,
  onCreateVideo,
}: YoutubeChannelDetailHeaderProps) {
  const initial = channel.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <Link
        to="/youtube-channels"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to YouTube Channels
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-lg font-semibold text-neutral-300">
            {initial}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-neutral-50">{channel.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{channel.handle}</p>
            <a
              href={channel.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block truncate text-sm text-secondary-400 hover:underline"
            >
              {channel.youtubeUrl.replace('https://', '')}
            </a>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {onEdit ? (
            <Button variant="outlined" className="rounded-lg" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onCreateVideo ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canCreateVideo || creatingVideo}
              onClick={onCreateVideo}
            >
              {creatingVideo ? 'Creating…' : 'Create Video'}
            </Button>
          ) : null}
          {onSync ? (
            <div>
              <Button className="rounded-lg" disabled={syncing} onClick={onSync}>
                {syncing ? 'Syncing videos...' : 'Sync Now'}
              </Button>
              {syncError ? <p className="mt-2 text-xs text-danger">{syncError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ChannelStatusPill status={channel.status} />
        <MonetizationPill status={channel.monetizationStatus} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-surface px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Type</p>
          <p className="mt-2 text-sm font-medium text-neutral-100">
            {YOUTUBE_CHANNEL_TYPE_LABELS[channel.type]}
          </p>
        </div>
        <div className="card-surface px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Niche</p>
          <p className="mt-2 text-sm font-medium text-neutral-100">{channel.niche}</p>
        </div>
        <div className="card-surface px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Target Audience</p>
          <p className="mt-2 text-sm font-medium text-neutral-100">{formatTargetAudienceLabel(channel.language)}</p>
        </div>
        <div className="card-surface px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Linked Email</p>
          <p className="mt-2 truncate text-sm font-mono text-neutral-100">{channel.linkedEmail}</p>
        </div>
        {channel.uploadSchedule ? (
          <div className="card-surface px-4 py-3 sm:col-span-2 lg:col-span-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Upload Schedule</p>
            <p className="mt-2 text-sm font-medium text-neutral-100">{channel.uploadSchedule}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function YoutubeChannelDetailHeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-40 rounded bg-neutral-800" />
      <div className="flex gap-3">
        <div className="size-12 rounded-xl bg-neutral-800" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-neutral-800" />
          <div className="h-4 w-32 rounded bg-neutral-800" />
          <div className="h-4 w-64 rounded bg-neutral-800" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-neutral-800" />
        ))}
      </div>
    </div>
  );
}
