import { Clapperboard, Upload } from 'lucide-react'
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

const typeOptions: { value: YoutubeChannelTypeFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả loại kênh' },
  { value: 'content', label: 'Nội dung' },
  { value: 'reup_audio', label: 'Reup âm thanh' },
  { value: 'reup_video', label: 'Reup video' },
]

const monetizationOptions: { value: YoutubeMonetizationFilter; label: string }[] = [
  { value: 'all', label: 'Kiếm tiền: Tất cả' },
  { value: 'monetized', label: 'Đã bật kiếm tiền' },
  { value: 'in_review', label: 'Đang xét duyệt' },
  { value: 'demonetized', label: 'Đã tắt kiếm tiền' },
  { value: 'limited', label: 'Bị hạn chế' },
]

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
  const secondaryActions = [
    onPrepareVideo
      ? {
          id: 'prepare',
          label: 'Chuẩn bị video',
          onSelect: onPrepareVideo,
          disabled: creatingVideo || !canCreateVideo,
        }
      : null,
    onDeleteUploadedVideos
      ? {
          id: 'delete-uploaded',
          label: deletingUploadedVideos ? 'Đang xóa…' : 'Xóa video đã tải lên',
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
              onChange={(e) => onSearchChange(e.currentTarget.value)}
              placeholder="Lọc kênh..."
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
              {creatingVideo ? 'Đang tạo…' : 'Tạo video'}
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
              {uploading ? 'Đang tải lên…' : 'Tải lên'}
            </Button>
          ) : null}
        </>
      }
      secondaryActions={secondaryActions}
      primaryAction={{ label: 'Thêm kênh', onClick: onAddChannel }}
    />
  )
}
