import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductionVideoListItem } from '../../types/videoProductionScenes'
import { Button, StatusBadge } from '../ui'
import {
  useProductionVideoWorkspace,
  type ProductionVideoPatch,
} from '../video-production/useProductionVideoWorkspace'

interface ChannelVideoDetailProps {
  video: ProductionVideoListItem
  onPatched: (channelId: string, videoId: string, patch: ProductionVideoPatch) => void
  onClose: () => void
}

/** A prepared/created channel video opened inside the Video production page: scenes, transcript, metadata, assembled video. */
export function ChannelVideoDetail({ video, onPatched, onClose }: ChannelVideoDetailProps) {
  const { t } = useTranslation('manual')
  const workspace = useProductionVideoWorkspace(video, onPatched)

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge
              tone={video.status === 'Created' ? 'success' : 'warning'}
              label={t(`channelVideo.status.${video.status}`)}
            />
            <span>
              {[video.channelName, video.videoId, video.sceneCount ? `${video.sceneCount} scene` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <Button size="sm" variant="ghost" aria-label={t('form.close')} onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <h2 lang="ja" className="text-base font-semibold break-words text-foreground">
          {video.title}
        </h2>
      </div>

      {workspace.detailPanel}

      {workspace.modals}
    </div>
  )
}
