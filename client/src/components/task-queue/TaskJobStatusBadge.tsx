import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { TaskStatus } from '../../types/taskQueue'

const statusConfig: Record<TaskStatus, { label: string; tone: StatusTone }> = {
  running: { label: 'Đang chạy', tone: 'primary' },
  completed: { label: 'Thành công', tone: 'success' },
  failed: { label: 'Thất bại', tone: 'danger' },
  queued: { label: 'Đang chờ', tone: 'neutral' },
  cancelled: { label: 'Đã hủy', tone: 'neutral' },
}

interface TaskJobStatusBadgeProps {
  status: TaskStatus
}

export function TaskJobStatusBadge({ status }: TaskJobStatusBadgeProps) {
  const config = statusConfig[status]
  return <StatusBadge label={config.label} tone={config.tone} withDot />
}
