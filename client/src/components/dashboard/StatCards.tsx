import { cn } from '../../lib/cn';
import type { OverviewStats } from '../../types/dashboard';

interface StatCardsProps {
  data: OverviewStats;
  loading?: boolean;
}

const stats = [
  { key: 'youtubeChannels' as const, label: 'Kênh YouTube', icon: 'youtube' },
  { key: 'tiktokAccounts' as const, label: 'Tài khoản TikTok', icon: 'tiktok' },
  { key: 'facebookAssets' as const, label: 'Tài nguyên Facebook', icon: 'facebook' },
  { key: 'sourceChannels' as const, label: 'Kênh nguồn', icon: 'source' },
];

function PlatformIcon({ icon }: { icon: string }) {
  const className = 'size-4 text-neutral-500';
  if (icon === 'youtube') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </svg>
    );
  }
  if (icon === 'tiktok') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
      </svg>
    );
  }
  if (icon === 'facebook') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

export function StatCards({ data, loading }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.key} className="card-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <PlatformIcon icon={stat.icon} />
            <span className="text-xs text-neutral-500">{stat.label}</span>
          </div>
          <p className={cn('mt-1 text-2xl font-semibold text-neutral-50', loading && 'animate-pulse text-neutral-700')}>
            {loading ? '—' : data[stat.key].toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
