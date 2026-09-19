import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import type { YoutubeChannelStatus } from '../../types/youtubeChannel'

const statusTone: Record<YoutubeChannelStatus, StatusTone> = {
  init: 'neutral',
  created: 'info',
  active: 'success',
  paused: 'warning',
  deleted: 'danger',
}

const statusKey: Record<YoutubeChannelStatus, string> = {
  init: 'status.init',
  created: 'status.created',
  active: 'status.active',
  paused: 'status.paused',
  deleted: 'status.deleted',
}

interface ChannelStatusPillProps {
  status: YoutubeChannelStatus
  className?: string
}

export function ChannelStatusPill({ status, className }: ChannelStatusPillProps) {
  const { t } = useTranslation('youtube')
  const key = statusKey[status] ?? statusKey.init
  const tone = statusTone[status] ?? statusTone.init
  return <StatusBadge label={t(key)} tone={tone} withDot className={className} />
}
