import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui'
import { type YoutubeChannel } from '../../types/youtubeChannel'

interface YoutubeChannelDetailHeaderProps {
  channel: YoutubeChannel
  syncing?: boolean
  syncError?: string | null
  videosFetchedAt?: string | null
  creatingVideo?: boolean
  canCreateVideo?: boolean
  canCreateFromSelection?: boolean
  openingProfile?: boolean
  canDeleteVideos?: boolean
  deletingVideos?: boolean
  canUploadVideos?: boolean
  uploadDisabledReason?: string
  onSync?: () => void
  onEdit?: () => void
  onCreateVideo?: () => void
  onPrepareVideo?: () => void
  onUploadVideos?: () => void
  onDeleteVideos?: () => void
  onOpenProfile?: () => void
  onRecreateMetadata?: () => void
}

function formatVideosFetchedAt(
  value: string | null | undefined,
  locale: string,
  notSynced: string,
): string {
  if (!value) return notSynced
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')
}

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase()
  return normalized.length > 0 && normalized !== 'default'
}

export function YoutubeChannelDetailHeader({
  channel,
  syncing,
  videosFetchedAt,
  creatingVideo,
  canCreateVideo,
  canCreateFromSelection,
  openingProfile,
  canDeleteVideos,
  deletingVideos,
  canUploadVideos,
  uploadDisabledReason,
  onSync,
  onCreateVideo,
  onPrepareVideo,
  onUploadVideos,
  onDeleteVideos,
  onOpenProfile,
  onRecreateMetadata,
}: YoutubeChannelDetailHeaderProps) {
  const { t, i18n } = useTranslation('youtube')
  const initial = channel.name.charAt(0).toUpperCase()
  const canOpenProfile = canOpenGpmProfile(channel.linkedEmail)
  const canRunCreateActions = canCreateFromSelection ?? canCreateVideo

  return (
    <div className="space-y-4">
      <Link
        to="/youtube-channels"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {t('page.backToList')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-lg font-semibold text-neutral-300">
            {initial}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-neutral-50">{channel.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{channel.handle}</p>
            <a
              href={channel.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block truncate text-sm text-secondary-400 hover:underline"
            >
              {channel.youtubeUrl.replace('https://', '')}
            </a>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2">
          <Button
            variant="outlined"
            className="rounded-lg"
            asChild
          >
            <Link to={`/video-production?channelId=${encodeURIComponent(channel.id)}`}>
              {t('actions.openVideoProduction')}
            </Link>
          </Button>
          {onRecreateMetadata ? (
            <Button variant="outlined" className="rounded-lg" onClick={onRecreateMetadata}>
              {t('actions.createMetadata')}
            </Button>
          ) : null}
          {onOpenProfile ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canOpenProfile || openingProfile}
              title={canOpenProfile ? undefined : t('actions.noLinkedEmail')}
              onClick={onOpenProfile}
            >
              {openingProfile ? t('actions.openingProfile') : t('actions.openProfile')}
            </Button>
          ) : null}
          {onPrepareVideo ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canRunCreateActions || creatingVideo}
              onClick={onPrepareVideo}
            >
              {t('actions.prepareVideo')}
            </Button>
          ) : null}
          {onCreateVideo ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canRunCreateActions || creatingVideo}
              onClick={onCreateVideo}
            >
              {creatingVideo ? t('actions.creating') : t('actions.createVideo')}
            </Button>
          ) : null}
          {onUploadVideos ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canUploadVideos}
              title={uploadDisabledReason}
              onClick={onUploadVideos}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('actions.upload')}
            </Button>
          ) : null}
          {onDeleteVideos ? (
            <Button
              variant="outlined"
              className="rounded-lg"
              disabled={!canDeleteVideos || deletingVideos}
              title={!canDeleteVideos ? t('actions.deleteVideosDisabled') : undefined}
              onClick={onDeleteVideos}
            >
              {deletingVideos ? t('actions.deletingVideos') : t('actions.deleteVideos')}
            </Button>
          ) : null}
          {onSync ? (
            <div>
              <Button className="rounded-lg" disabled={syncing} onClick={onSync}>
                {syncing
                  ? t('actions.syncing')
                  : t('actions.syncNow', {
                      fetchedAt: formatVideosFetchedAt(
                        videosFetchedAt,
                        i18n.language,
                        t('actions.notSynced'),
                      ),
                    })}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function YoutubeChannelDetailHeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-40 rounded bg-neutral-800" />
      <div className="flex gap-3">
        <div className="size-12 rounded-xl bg-neutral-800" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-neutral-800" />
          <div className="h-4 w-32 rounded bg-neutral-800" />
          <div className="h-4 w-64 rounded bg-neutral-800" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-16 rounded-full bg-neutral-800" />
        <div className="h-6 w-24 rounded-full bg-neutral-800" />
        <div className="h-6 w-20 rounded-full bg-neutral-800" />
      </div>
    </div>
  )
}
