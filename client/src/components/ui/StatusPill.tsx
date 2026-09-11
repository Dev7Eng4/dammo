import { StatusBadge } from './StatusBadge'

type MailAccountStatus = 'active' | 'need_verify' | 'suspended'

const statusConfig: Record<
  MailAccountStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  active: { label: 'Hoạt động', tone: 'success' },
  need_verify: { label: 'Cần xác minh', tone: 'warning' },
  suspended: { label: 'Đã khóa', tone: 'danger' },
}

export interface StatusPillProps {
  status: MailAccountStatus
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const config = statusConfig[status]
  return <StatusBadge label={config.label} tone={config.tone} withDot className={className} />
}
