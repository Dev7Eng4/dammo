import { Clapperboard, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ListToolbar } from '../layout'
import { Button, DropdownSelect, SearchInput } from '../ui'
import { type YoutubeChannelTypeFilter, type YoutubeMonetizationFilter } from '../../types/youtubeChannel'

interface YoutubeChannelsToolbarProps {
  typeFilter: YoutubeChannelTypeFilter
  monetizationFilter: YoutubeMonetizationFilter
  search: string
  canCreateVideo?: boolean
  createVideoDisabledReason?: string
  creatingVideo?: boolean
  canUpload?: boolean
  uploadDisabledReason?: string
  uploading?: boolean
  deletingUploadedVideos?: boolean
  onTypeFilterChange: (value: YoutubeChannelTypeFilter) => void
  onMonetizationFilterChange: (value: YoutubeMonetizationFilter) => void
  onSearchChange: (value: string) => void
  onAddChannel: () => void
  onCreateVideo?: () => void
  onPrepareVideo?: () => void
  onUpload?: () => void
  onDeleteUploadedVideos?: () => void
}

export function YoutubeChannelsToolbar({
  typeFilter,
  monetizationFilter,
  search,
  canCreateVideo,
  createVideoDisabledReason,
  creatingVideo,
  canUpload,
  uploadDisabledReason,
  uploading,
  deletingUploadedVideos,
  onTypeFilterChange,
  onMonetizationFilterChange,
  onSearchChange,
  onAddChannel,
  onCreateVideo,
  onPrepareVideo,
  onUpload,
  onDeleteUploadedVideos,
}: YoutubeChannelsToolbarProps) {
  const { t } = useTranslation('youtube')

  const typeOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('filter.typeAll') },
      { value: 'content' as const, label: t('filter.typeContent') },
      { value: 'reup_audio' as const, label: t('filter.typeReupAudio') },
      { value: 'reup_video' as const, label: t('filter.typeReupVideo') },
    ],
    [t],
  )

  const monetizationOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('filter.monetizationAll') },
      { value: 'monetized' as const, label: t('filter.monetized') },
      { value: 'in_review' as const, label: t('filter.inReview') },
      { value: 'demonetized' as const, label: t('filter.demonetized') },
      { value: 'limited' as const, label: t('filter.limited') },
    ],
    [t],
  )

  const secondaryActions = [
    onPrepareVideo
      ? {
          id: 'prepare',
          label: t('toolbar.prepareVideo'),
          onSelect: onPrepareVideo,
          disabled: creatingVideo || !canCreateVideo,
        }
      : null,
    onDeleteUploadedVideos
      ? {
          id: 'delete-uploaded',
          label: deletingUploadedVideos
            ? t('toolbar.deleteUploadedDeleting')
            : t('toolbar.deleteUploaded'),
          onSelect: onDeleteUploadedVideos,
          disabled: deletingUploadedVideos,
          destructive: true,
          separatorBefore: true,
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string
    label: string
    onSelect: () => void
    disabled?: boolean
    destructive?: boolean
    separatorBefore?: boolean
  }>

  return (
    <ListToolbar
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <DropdownSelect
            options={typeOptions}
            value={typeFilter}
            onChange={onTypeFilterChange}
            menuClassName="w-48"
          />
          <DropdownSelect
            options={monetizationOptions}
            value={monetizationFilter}
            onChange={onMonetizationFilterChange}
            menuClassName="w-52"
          />
          <div className="w-48 lg:w-56">
            <SearchInput
              value={typeof search === 'string' ? search : ''}
              onChange={e => onSearchChange(e.currentTarget.value)}
              placeholder={t('toolbar.filterPlaceholder')}
              className="h-9"
            />
          </div>
        </div>
      }
      extraActions={
        <>
          {onCreateVideo ? (
            <Button
              variant="outlined"
              size="sm"
              onClick={onCreateVideo}
              disabled={creatingVideo || !canCreateVideo}
              title={!creatingVideo ? createVideoDisabledReason : undefined}
            >
              <Clapperboard className="size-3.5" />
              {creatingVideo ? t('toolbar.creatingVideo') : t('toolbar.createVideo')}
            </Button>
          ) : null}
          {onUpload ? (
            <Button
              variant="outlined"
              size="sm"
              onClick={onUpload}
              disabled={uploading || !canUpload}
              title={!uploading ? uploadDisabledReason : undefined}
            >
              <Upload className="size-3.5" />
              {uploading ? t('toolbar.uploading') : t('toolbar.upload')}
            </Button>
          ) : null}
        </>
      }
      secondaryActions={secondaryActions}
      primaryAction={{ label: t('toolbar.addChannel'), onClick: onAddChannel }}
    />
  )
}
