import { Copy, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductionVideoListItem } from '../../types/videoProductionScenes'
import { Button, StatusBadge, useToast } from '../ui'
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
  const { t: tf } = useTranslation('factory')
  const { toast } = useToast()
  const workspace = useProductionVideoWorkspace(video, onPatched)

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Clipboard API refused (permission / embedded browser): fall back to a hidden textarea.
      const area = document.createElement('textarea')
      area.value = path
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      if (!ok) {
        toast.error(tf('production.toolbar.copyPathError'))
        return
      }
    }
    toast.success(tf('production.toolbar.copyPathSuccess'))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge
              tone={video.status === 'Created' ? 'success' : video.status === 'Preparing' ? 'info' : 'warning'}
              label={t(`channelVideo.status.${video.status}`)}
            />
            <span>
              {[video.channelName, video.videoId, video.sceneCount ? t('channelVideo.sceneCount', { count: video.sceneCount }) : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {video.videoFolderPath ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2.5"
                title={video.videoFolderPath}
                onClick={() => void copyPath(video.videoFolderPath as string)}
              >
                <Copy className="size-4" />
                {tf('production.toolbar.copyPath')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" aria-label={t('form.close')} onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
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
