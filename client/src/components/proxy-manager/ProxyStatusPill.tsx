import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { ProxyStatus } from '../../types/proxy'

const statusTone: Record<ProxyStatus, StatusTone> = {
  active: 'success',
  failed: 'danger',
  slow: 'warning',
  expired: 'neutral',
  in_use: 'primary',
}

const statusKey: Record<ProxyStatus, string> = {
  active: 'proxy.status.active',
  failed: 'proxy.status.failed',
  slow: 'proxy.status.slow',
  expired: 'proxy.status.expired',
  in_use: 'proxy.status.inUse',
}

interface ProxyStatusPillProps {
  status: ProxyStatus
  className?: string
}

export function ProxyStatusPill({ status, className }: ProxyStatusPillProps) {
  const { t } = useTranslation('browser')
  return <StatusBadge label={t(statusKey[status])} tone={statusTone[status]} withDot className={className} />
}
