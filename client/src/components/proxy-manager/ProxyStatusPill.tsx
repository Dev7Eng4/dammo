import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { ProxyStatus } from '../../types/proxy'

const statusConfig: Record<ProxyStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Hoạt động', tone: 'success' },
  failed: { label: 'Thất bại', tone: 'danger' },
  slow: { label: 'Chậm', tone: 'warning' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
  in_use: { label: 'Đang dùng', tone: 'primary' },
}

interface ProxyStatusPillProps {
  status: ProxyStatus
  className?: string
}

export function ProxyStatusPill({ status, className }: ProxyStatusPillProps) {
  const config = statusConfig[status]
  return <StatusBadge label={config.label} tone={config.tone} withDot className={className} />
}
