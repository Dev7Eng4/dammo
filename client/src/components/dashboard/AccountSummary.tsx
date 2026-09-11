import type { AccountSummary } from '../../types/dashboard'

interface AccountSummaryCardProps {
  data: AccountSummary
  loading?: boolean
}

export function AccountSummaryCard({ data, loading }: AccountSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-muted-foreground">Tóm tắt tài khoản</p>
      <p className="text-3xl font-semibold tracking-tight text-foreground">
        {loading ? '—' : data.total.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Tổng số tài khoản email</p>
    </div>
  )
}
