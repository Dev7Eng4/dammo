import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { YoutubeChannelStatus } from '../../types/youtubeChannel'

const statusConfig: Record<YoutubeChannelStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Đang hoạt động', tone: 'success' },
  suspended: { label: 'Đã đình chỉ', tone: 'danger' },
}

interface ChannelStatusPillProps {
  status: YoutubeChannelStatus
  className?: string
}

export function ChannelStatusPill({ status, className }: ChannelStatusPillProps) {
  const config = statusConfig[status]
  return <StatusBadge label={config.label} tone={config.tone} withDot className={className} />
}
