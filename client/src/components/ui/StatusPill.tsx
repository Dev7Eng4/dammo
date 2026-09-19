import { useTranslation } from 'react-i18next'
import { StatusBadge } from './StatusBadge'

type MailAccountStatus = 'active' | 'need_verify' | 'suspended'

const statusTone: Record<MailAccountStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  need_verify: 'warning',
  suspended: 'danger',
}

const statusKey: Record<MailAccountStatus, string> = {
  active: 'status.active',
  need_verify: 'status.needVerify',
  suspended: 'status.suspended',
}

export interface StatusPillProps {
  status: MailAccountStatus
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const { t } = useTranslation('common')
  return (
    <StatusBadge label={t(statusKey[status])} tone={statusTone[status]} withDot className={className} />
  )
}
