import { useTranslation } from 'react-i18next'
import type { ProjectStatus } from '../../types/dashboard'
import { StatusBadge } from './StatusBadge'

const statusTone: Record<ProjectStatus, 'success' | 'danger' | 'info'> = {
  success: 'success',
  failed: 'danger',
  rendering: 'info',
}

const statusKey: Record<ProjectStatus, string> = {
  success: 'status.success',
  failed: 'status.failed',
  rendering: 'status.rendering',
}

export interface BadgeProps {
  status: ProjectStatus
  className?: string
}

export function Badge({ status, className }: BadgeProps) {
  const { t } = useTranslation('common')
  return <StatusBadge label={t(statusKey[status])} tone={statusTone[status]} className={className} />
}
