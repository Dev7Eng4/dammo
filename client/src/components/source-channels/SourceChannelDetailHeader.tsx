import { Link } from 'react-router-dom';
import type { Niche } from '../../types/niche';
import type { SourceChannel } from '../../types/sourceChannel';
import { resolveNicheLabel } from '../../utils/niche';
import { PlatformIcon } from '../mail-accounts/PlatformIcon';
import { Button } from '../ui';
import { PurposePill } from './PurposePill';
import { RiskPill } from './RiskPill';

interface SourceChannelDetailHeaderProps {
  source: SourceChannel;
  niches?: Niche[];
  refreshing?: boolean;
  refreshError?: string | null;
  onRefresh?: () => void;
}

export function SourceChannelDetailHeader({
  source,
  niches = [],
  refreshing,
  refreshError,
  onRefresh,
}: SourceChannelDetailHeaderProps) {
  return (
    <div className='space-y-4'>
      <Link to='/source-channels' className='inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200'>
        <svg className='size-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
          <path d='m15 18-6-6 6-6' />
        </svg>
        Quay lại nguồn
      </Link>

      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-neutral-400'>
            <PlatformIcon platform={source.platform} className='size-6' />
          </div>
          <div className='min-w-0'>
            <h1 className='text-xl font-semibold text-neutral-50'>{source.name}</h1>
            <a
              href={source.fullUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-1 inline-block truncate text-sm text-secondary-400 hover:underline'
            >
              {source.fullUrl.replace('https://', '')}
            </a>
            <p className='mt-1 text-sm text-neutral-500'>{resolveNicheLabel(source.niche, niches)}</p>
          </div>
        </div>

        {source.platform === 'youtube' && onRefresh ? (
          <div className='shrink-0'>
            <Button className='rounded-lg' disabled={refreshing} onClick={onRefresh}>
              {refreshing ? 'Đang cập nhật nguồn...' : 'Cập nhật nguồn'}
            </Button>
            {refreshError ? <p className='mt-2 text-xs text-danger'>{refreshError}</p> : null}
          </div>
        ) : null}
      </div>

      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='card-surface px-4 py-3'>
          <p className='text-[10px] font-medium uppercase tracking-wider text-neutral-500'>Mục đích</p>
          <div className='mt-2'>
            <PurposePill purpose={source.purpose} />
          </div>
        </div>
        <div className='card-surface px-4 py-3'>
          <p className='text-[10px] font-medium uppercase tracking-wider text-neutral-500'>Mức rủi ro</p>
          <div className='mt-2'>
            <RiskPill risk={source.riskLevel} />
          </div>
        </div>
        {source.subscriberCount !== undefined ? (
          <div className='card-surface px-4 py-3'>
            <p className='text-[10px] font-medium uppercase tracking-wider text-neutral-500'>Người đăng ký</p>
            <p className='mt-2 text-lg font-semibold text-neutral-100'>{source.subscriberCount.toLocaleString()}</p>
          </div>
        ) : null}
        {source.videoCount !== undefined ? (
          <div className='card-surface px-4 py-3'>
            <p className='text-[10px] font-medium uppercase tracking-wider text-neutral-500'>Video</p>
            <p className='mt-2 text-lg font-semibold text-neutral-100'>{source.videoCount.toLocaleString()}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SourceChannelDetailHeaderSkeleton() {
  return (
    <div className='animate-pulse space-y-4'>
      <div className='h-4 w-32 rounded bg-neutral-800' />
      <div className='flex gap-3'>
        <div className='size-12 rounded-xl bg-neutral-800' />
        <div className='flex-1 space-y-2'>
          <div className='h-6 w-48 rounded bg-neutral-800' />
          <div className='h-4 w-64 rounded bg-neutral-800' />
        </div>
      </div>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-20 rounded-2xl bg-neutral-800' />
        ))}
      </div>
    </div>
  );
}
