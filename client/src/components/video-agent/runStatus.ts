import type { VideoAgentRunStatus } from '../../types/videoAgent'
import type { StatusTone } from '../ui'

export const RUN_STATUS_TONE: Record<VideoAgentRunStatus, StatusTone> = {
  draft: 'neutral',
  queued: 'neutral',
  running: 'info',
  awaiting_approval: 'warning',
  interrupted: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}
