import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { TaskStatus } from '../../types/taskQueue'

const statusTone: Record<TaskStatus, StatusTone> = {
  running: 'primary',
  completed: 'success',
  failed: 'danger',
  queued: 'neutral',
  cancelled: 'neutral',
}

interface TaskJobStatusBadgeProps {
  status: TaskStatus
}

export function TaskJobStatusBadge({ status }: TaskJobStatusBadgeProps) {
  const { t } = useTranslation('factory')
  return <StatusBadge label={t(`queue.status.${status}`)} tone={statusTone[status]} withDot />
}
