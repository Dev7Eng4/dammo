import { cn } from '../../lib/cn';
import type { AccountSummary } from '../../types/dashboard';

interface AccountSummaryCardProps {
  data: AccountSummary;
  loading?: boolean;
}

const rows = [
  { key: 'active' as const, label: 'Active' },
  { key: 'needVerify' as const, label: 'Need Verify', tone: 'warning' as const },
  { key: 'limited' as const, label: 'Limited' },
  { key: 'suspended' as const, label: 'Suspended', tone: 'danger' as const },
  { key: 'lostAccess' as const, label: 'Lost Access' },
];

export function AccountSummaryCard({ data, loading }: AccountSummaryCardProps) {
  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Account Summary</p>
      <p className={cn('text-3xl font-semibold text-neutral-50', loading && 'animate-pulse text-neutral-700')}>
        {loading ? '—' : data.total.toLocaleString()}
      </p>
      <p className="text-xs text-neutral-500">Total</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">{row.label}</span>
            <span
              className={cn(
                'font-medium text-neutral-200',
                row.tone === 'warning' && 'text-warning',
                row.tone === 'danger' && 'text-danger',
                loading && 'animate-pulse text-neutral-700',
              )}
            >
              {loading ? '—' : data[row.key].toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
