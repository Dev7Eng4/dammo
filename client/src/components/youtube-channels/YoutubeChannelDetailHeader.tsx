import {
  Clapperboard,
  FileText,
  Film,
  FolderInput,
  ListChecks,
  RefreshCw,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Button, Tooltip } from '../ui'
import { type YoutubeChannel } from '../../types/youtubeChannel'

interface YoutubeChannelDetailHeaderProps {
  channel: YoutubeChannel
  /** Rendered between the back link and the action buttons. */
  hero?: ReactNode
  /** Rendered on the same line as the action buttons (left side). */
  toolbar?: ReactNode
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
  canMoveVideos?: boolean
  movingVideos?: boolean
  onSync?: () => void
  onEdit?: () => void
  onCreateVideo?: () => void
  onPrepareVideo?: () => void
  onUploadVideos?: () => void
  onMoveVideos?: () => void
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

interface IconActionProps {
  label: string
  /** Extra hint shown under the label (e.g. why the action is disabled). */
  hint?: string
  icon: ReactNode
  disabled?: boolean
  variant?: 'outlined' | 'primary' | 'danger'
  onClick?: () => void
  asChild?: boolean
  children?: ReactNode
}

/**
 * Square icon button; the text label appears in a tooltip on hover/focus.
 * The button is wrapped in a span so the tooltip still works while it is disabled.
 */
function IconAction({ label, hint, icon, disabled, variant = 'outlined', onClick, asChild, children }: IconActionProps) {
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="font-medium">{label}</span>
          {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
        </span>
      }
    >
      <span className={cn('inline-flex', disabled && 'cursor-not-allowed')} tabIndex={disabled ? 0 : -1}>
        <Button
          variant={variant}
          size="icon"
          className="size-9 rounded-lg"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          asChild={asChild}
        >
          {asChild ? children : icon}
        </Button>
      </span>
    </Tooltip>
  )
}

export function YoutubeChannelDetailHeader({
  channel,
  hero,
  toolbar,
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
  canMoveVideos,
  movingVideos,
  onSync,
  onCreateVideo,
  onPrepareVideo,
  onUploadVideos,
  onMoveVideos,
  onDeleteVideos,
  onOpenProfile,
  onRecreateMetadata,
}: YoutubeChannelDetailHeaderProps) {
  const { t, i18n } = useTranslation('youtube')
  const { state } = useLocation()
  const requestedReturn =
    state && typeof state === 'object' && 'returnTo' in state && typeof state.returnTo === 'string'
      ? state.returnTo
      : ''
  const returnTo =
    requestedReturn === '/youtube-channels' || requestedReturn.startsWith('/youtube-channels?')
      ? requestedReturn
      : '/youtube-channels'
  const canOpenProfile = canOpenGpmProfile(channel.linkedEmail)
  const canRunCreateActions = canCreateFromSelection ?? canCreateVideo

  return (
    <div className="space-y-4">
      <Link
        to={returnTo}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        {t('page.backToList')}
      </Link>

      {hero}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{toolbar}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <IconAction
          label={t('actions.openVideoProduction')}
          icon={<Clapperboard className="size-4" />}
          asChild
        >
          <Link to={`/video-production?channelId=${encodeURIComponent(channel.id)}`}>
            <Clapperboard className="size-4" />
          </Link>
        </IconAction>
        {onRecreateMetadata ? (
          <IconAction
            label={t('actions.createMetadata')}
            icon={<FileText className="size-4" />}
            onClick={onRecreateMetadata}
          />
        ) : null}
        {onOpenProfile ? (
          <IconAction
            label={openingProfile ? t('actions.openingProfile') : t('actions.openProfile')}
            hint={canOpenProfile ? undefined : t('actions.noLinkedEmail')}
            icon={<UserRound className="size-4" />}
            disabled={!canOpenProfile || openingProfile}
            onClick={onOpenProfile}
          />
        ) : null}
        {onPrepareVideo ? (
          <IconAction
            label={t('actions.prepareVideo')}
            icon={<ListChecks className="size-4" />}
            disabled={!canRunCreateActions || creatingVideo}
            onClick={onPrepareVideo}
          />
        ) : null}
        {onCreateVideo ? (
          <IconAction
            label={creatingVideo ? t('actions.creating') : t('actions.createVideo')}
            icon={<Film className="size-4" />}
            disabled={!canRunCreateActions || creatingVideo}
            onClick={onCreateVideo}
          />
        ) : null}
        {onUploadVideos ? (
          <IconAction
            label={t('actions.upload')}
            hint={uploadDisabledReason}
            icon={<Upload className="size-4" />}
            disabled={!canUploadVideos}
            onClick={onUploadVideos}
          />
        ) : null}
        {onMoveVideos ? (
          <IconAction
            label={movingVideos ? t('actions.movingVideos') : t('actions.move')}
            icon={<FolderInput className="size-4" />}
            disabled={!canMoveVideos || movingVideos}
            onClick={onMoveVideos}
          />
        ) : null}
        {onDeleteVideos ? (
          <IconAction
            label={deletingVideos ? t('actions.deletingVideos') : t('actions.deleteVideos')}
            hint={!canDeleteVideos ? t('actions.deleteVideosDisabled') : undefined}
            icon={<Trash2 className="size-4" />}
            variant="danger"
            disabled={!canDeleteVideos || deletingVideos}
            onClick={onDeleteVideos}
          />
        ) : null}
        {onSync ? (
          <IconAction
            label={
              syncing
                ? t('actions.syncing')
                : t('actions.syncNow', {
                    fetchedAt: formatVideosFetchedAt(videosFetchedAt, i18n.language, t('actions.notSynced')),
                  })
            }
            icon={<RefreshCw className={cn('size-4', syncing && 'animate-spin')} />}
            variant="primary"
            disabled={syncing}
            onClick={onSync}
          />
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
