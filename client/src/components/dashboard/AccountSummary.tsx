import { useTranslation } from 'react-i18next'
import type { AccountSummary } from '../../types/dashboard'

interface AccountSummaryCardProps {
  data: AccountSummary
  loading?: boolean
}

export function AccountSummaryCard({ data, loading }: AccountSummaryCardProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="section-label mb-3">{t('accountSummary.title')}</p>
      <p className="text-3xl font-semibold tracking-tight text-foreground">
        {loading ? '—' : data.total.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('accountSummary.emailTotal')}</p>
    </div>
  )
}
