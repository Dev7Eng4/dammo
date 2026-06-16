import { cn } from '../../lib/cn';
import type { YoutubeChannelStats } from '../../types/youtubeChannel';

interface YoutubeChannelStatCardsProps {
  data: YoutubeChannelStats | null;
  loading?: boolean;
}

const cards = [
  {
    key: 'total' as const,
    label: 'Total Channels',
    sub: (d: YoutubeChannelStats) => `+${d.addedThisWeek} this week`,
  },
  {
    key: 'monetized' as const,
    label: 'Monetized',
    sub: (d: YoutubeChannelStats) =>
      d.total > 0 ? `${Math.round((d.monetized / d.total) * 100)}% of total` : '—',
  },
  {
    key: 'inReview' as const,
    label: 'In Review',
    sub: () => 'Avg 3 days',
  },
  {
    key: 'limited' as const,
    label: 'Limited / Dem.',
    sub: () => 'Needs action',
  },
  {
    key: 'stale' as const,
    label: 'Stale (No Uploads)',
    sub: () => '> 7 days',
  },
];

export function YoutubeChannelStatCards({ data, loading }: YoutubeChannelStatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((card) => {
        const value = data ? data[card.key] : 0;
        return (
          <div key={card.key} className="card-surface px-4 py-3">
            <span className="text-xs text-neutral-500">{card.label}</span>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold text-neutral-50',
                loading && 'animate-pulse text-neutral-700',
              )}
            >
              {loading ? '—' : value.toLocaleString()}
            </p>
            {!loading && data ? (
              <p className="mt-0.5 text-[11px] text-neutral-500">{card.sub(data)}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
