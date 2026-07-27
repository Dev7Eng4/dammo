import { cn } from '../../lib/cn';
import type { ProxyStats } from '../../types/proxy';

interface ProxyStatCardsProps {
  data: ProxyStats | null;
  loading?: boolean;
}

const cards: Array<{
  key: keyof ProxyStats;
  label: string;
  valueClass?: string;
  format?: (value: number) => string;
}> = [
  { key: 'total', label: 'Tổng Proxy' },
  { key: 'active', label: 'Hoạt động', valueClass: 'text-success' },
  { key: 'failed', label: 'Thất bại', valueClass: 'text-danger' },
  { key: 'assigned', label: 'Đã gán', valueClass: 'text-primary-400' },
  { key: 'unassigned', label: 'Chưa gán', valueClass: 'text-neutral-400' },
  {
    key: 'avgLatencyMs',
    label: 'Độ trễ TB',
    valueClass: 'text-warning',
    format: (value) => (value > 0 ? `${value}ms` : '—'),
  },
];

export function ProxyStatCards({ data, loading }: ProxyStatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {cards.map((card) => {
        const rawValue = data ? data[card.key] : 0;
        const display = card.format ? card.format(rawValue) : rawValue.toLocaleString();

        return (
          <div key={card.key} className="card-surface px-4 py-3">
            <span className="text-xs text-neutral-500">{card.label}</span>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold text-neutral-50',
                card.valueClass,
                loading && 'animate-pulse text-neutral-700',
              )}
            >
              {loading ? '—' : display}
            </p>
          </div>
        );
      })}
    </div>
  );
}
