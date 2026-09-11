import type { ProjectStatus } from '../../types/dashboard'
import { StatusBadge } from './StatusBadge'

const statusMap: Record<ProjectStatus, { tone: 'success' | 'danger' | 'info'; label: string }> = {
  success: { tone: 'success', label: 'Thành công' },
  failed: { tone: 'danger', label: 'Thất bại' },
  rendering: { tone: 'info', label: 'Đang render' },
}

export interface BadgeProps {
  status: ProjectStatus
  className?: string
}

export function Badge({ status, className }: BadgeProps) {
  const config = statusMap[status]
  return <StatusBadge label={config.label} tone={config.tone} className={className} />
}
