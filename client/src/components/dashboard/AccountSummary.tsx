import type { AccountSummary } from '../../types/dashboard';

interface AccountSummaryCardProps {
  data: AccountSummary;
  loading?: boolean;
}

export function AccountSummaryCard({ data, loading }: AccountSummaryCardProps) {
  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Tóm tắt tài khoản</p>
      <p className="text-3xl font-semibold text-neutral-50">{loading ? '—' : data.total.toLocaleString()}</p>
      <p className="text-xs text-neutral-500">Tổng số tài khoản email</p>
    </div>
  );
}
