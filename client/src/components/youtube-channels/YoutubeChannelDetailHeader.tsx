import { Link } from 'react-router-dom';
import { Button } from '../ui';
import { type YoutubeChannel } from '../../types/youtubeChannel';
import { ChannelStatusPill } from './ChannelStatusPill';
import { ChannelTypePill } from './ChannelTypePill';
import { MonetizationPill } from './MonetizationPill';

interface YoutubeChannelDetailHeaderProps {
  channel: YoutubeChannel;
  syncing?: boolean;
  syncError?: string | null;
  videosFetchedAt?: string | null;
  creatingVideo?: boolean;
  canCreateVideo?: boolean;
  openingProfile?: boolean;
  onSync?: () => void;
  onEdit?: () => void;
  onCreateVideo?: () => void;
  onOpenProfile?: () => void;
}

function formatVideosFetchedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN');
}

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'default';
}

export function YoutubeChannelDetailHeader({
  channel,
  syncing,
  syncError,
  videosFetchedAt,
  creatingVideo,
  canCreateVideo,
  openingProfile,
  onSync,
  onEdit,
  onCreateVideo,
  onOpenProfile,
}: YoutubeChannelDetailHeaderProps) {
  const initial = channel.name.charAt(0).toUpperCase();
  const canOpenProfile = canOpenGpmProfile(channel.linkedEmail);

  return (
    <div className='space-y-4'>
      <Link to='/youtube-channels' className='inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200'>
        <svg className='size-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
          <path d='m15 18-6-6 6-6' />
        </svg>
        Quay lại danh sách kênh YouTube
      </Link>

      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-lg font-semibold text-neutral-300'>
            {initial}
          </div>
          <div className='min-w-0'>
            <h1 className='text-xl font-semibold text-neutral-50'>{channel.name}</h1>
            <p className='mt-0.5 text-sm text-neutral-500'>{channel.handle}</p>
            <a
              href={channel.youtubeUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-1 inline-block truncate text-sm text-secondary-400 hover:underline'
            >
              {channel.youtubeUrl.replace('https://', '')}
            </a>
          </div>
        </div>

        <div className='flex shrink-0 flex-wrap items-start gap-2'>
          {onOpenProfile ? (
            <Button
              variant='outlined'
              className='rounded-lg'
              disabled={!canOpenProfile || openingProfile}
              title={canOpenProfile ? undefined : 'Kênh chưa có email liên kết'}
              onClick={onOpenProfile}
            >
              {openingProfile ? 'Đang mở…' : 'Mở Profile'}
            </Button>
          ) : null}
          {onCreateVideo ? (
            <Button variant='outlined' className='rounded-lg' disabled={!canCreateVideo || creatingVideo} onClick={onCreateVideo}>
              {creatingVideo ? 'Đang tạo…' : 'Tạo video'}
            </Button>
          ) : null}
          {onSync ? (
            <div>
              <Button className='rounded-lg' disabled={syncing} onClick={onSync}>
                {syncing ? 'Đang đồng bộ video...' : `Đồng bộ ngay (${formatVideosFetchedAt(videosFetchedAt)})`}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* <div className='flex flex-wrap gap-2'>
        <ChannelStatusPill status={channel.status} />
        <MonetizationPill status={channel.monetizationStatus} />
        <ChannelTypePill type={channel.type} />
      </div> */}
    </div>
  );
}

export function YoutubeChannelDetailHeaderSkeleton() {
  return (
    <div className='animate-pulse space-y-4'>
      <div className='h-4 w-40 rounded bg-neutral-800' />
      <div className='flex gap-3'>
        <div className='size-12 rounded-xl bg-neutral-800' />
        <div className='flex-1 space-y-2'>
          <div className='h-6 w-48 rounded bg-neutral-800' />
          <div className='h-4 w-32 rounded bg-neutral-800' />
          <div className='h-4 w-64 rounded bg-neutral-800' />
        </div>
      </div>
      <div className='flex gap-2'>
        <div className='h-6 w-16 rounded-full bg-neutral-800' />
        <div className='h-6 w-24 rounded-full bg-neutral-800' />
        <div className='h-6 w-20 rounded-full bg-neutral-800' />
      </div>
    </div>
  );
}
