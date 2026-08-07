import { Button, DropdownSelect } from '../ui';
import { type YoutubeChannelTypeFilter, type YoutubeMonetizationFilter } from '../../types/youtubeChannel';

interface YoutubeChannelsToolbarProps {
  typeFilter: YoutubeChannelTypeFilter;
  monetizationFilter: YoutubeMonetizationFilter;
  search: string;
  canCreateVideo?: boolean;
  createVideoDisabledReason?: string;
  creatingVideo?: boolean;
  canUpload?: boolean;
  uploadDisabledReason?: string;
  uploading?: boolean;
  deletingUploadedVideos?: boolean;
  canEdit?: boolean;
  editDisabledReason?: string;
  onTypeFilterChange: (value: YoutubeChannelTypeFilter) => void;
  onMonetizationFilterChange: (value: YoutubeMonetizationFilter) => void;
  onSearchChange: (value: string) => void;
  onAddChannel: () => void;
  onCreateVideo?: () => void;
  onPrepareVideo?: () => void;
  onUpload?: () => void;
  onDeleteUploadedVideos?: () => void;
  onEdit?: () => void;
}

const typeOptions: { value: YoutubeChannelTypeFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả loại kênh' },
  { value: 'content', label: 'Nội dung' },
  { value: 'reup_audio', label: 'Reup âm thanh' },
  { value: 'reup_video', label: 'Reup video' },
];

const monetizationOptions: { value: YoutubeMonetizationFilter; label: string }[] = [
  { value: 'all', label: 'Kiếm tiền: Tất cả' },
  { value: 'monetized', label: 'Đã bật kiếm tiền' },
  { value: 'in_review', label: 'Đang xét duyệt' },
  { value: 'demonetized', label: 'Đã tắt kiếm tiền' },
  { value: 'limited', label: 'Bị hạn chế' },
];

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
  canEdit,
  editDisabledReason,
  onTypeFilterChange,
  onMonetizationFilterChange,
  onSearchChange,
  onAddChannel,
  onCreateVideo,
  onPrepareVideo,
  onUpload,
  onDeleteUploadedVideos,
  onEdit,
}: YoutubeChannelsToolbarProps) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {/* <DropdownSelect options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} /> */}
        {/* <DropdownSelect
          options={monetizationOptions}
          value={monetizationFilter}
          onChange={onMonetizationFilterChange}
        /> */}
        <div className='relative'>
          <svg
            className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <circle cx='11' cy='11' r='8' />
            <path d='m21 21-4.3-4.3' />
          </svg>
          <input
            type='search'
            value={typeof search === 'string' ? search : ''}
            onChange={e => onSearchChange(e.currentTarget.value)}
            placeholder='Lọc kênh...'
            className='h-10 w-48 rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 lg:w-56'
          />
        </div>
      </div>

      <div className='flex items-center gap-3'>
        {onPrepareVideo ? (
          <Button
            variant='outlined'
            className='rounded-lg'
            onClick={onPrepareVideo}
            disabled={creatingVideo || !canCreateVideo}
            title={!creatingVideo ? createVideoDisabledReason : undefined}
          >
            <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
              <polyline points='14 2 14 8 20 8' />
              <line x1='12' y1='18' x2='12' y2='12' />
              <line x1='9' y1='15' x2='15' y2='15' />
            </svg>
            Chuẩn bị video
          </Button>
        ) : null}
        {onCreateVideo ? (
          <Button
            variant='outlined'
            className='rounded-lg'
            onClick={onCreateVideo}
            disabled={creatingVideo || !canCreateVideo}
            title={!creatingVideo ? createVideoDisabledReason : undefined}
          >
            <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='m15 10 4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14' />
              <rect x='3' y='6' width='12' height='12' rx='2' />
            </svg>
            {creatingVideo ? 'Đang tạo…' : 'Tạo video'}
          </Button>
        ) : null}
        {onUpload ? (
          <Button
            variant='outlined'
            className='rounded-lg'
            onClick={onUpload}
            disabled={uploading || !canUpload}
            title={!uploading ? uploadDisabledReason : undefined}
          >
            <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
              <polyline points='17 8 12 3 7 8' />
              <line x1='12' y1='3' x2='12' y2='15' />
            </svg>
            {uploading ? 'Đang tải lên…' : 'Tải lên'}
          </Button>
        ) : null}
        {onDeleteUploadedVideos ? (
          <Button variant='danger' className='rounded-lg' onClick={onDeleteUploadedVideos} disabled={deletingUploadedVideos}>
            <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <polyline points='3 6 5 6 21 6' />
              <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
            </svg>
            {deletingUploadedVideos ? 'Đang xóa…' : 'Xóa video Đã tạo'}
          </Button>
        ) : null}
        {onEdit ? (
          <Button
            variant='outlined'
            className='rounded-lg'
            onClick={onEdit}
            disabled={!canEdit}
            title={!canEdit ? editDisabledReason : undefined}
          >
            Chỉnh sửa
          </Button>
        ) : null}
        <button type='button' className='inline-flex items-center gap-1.5 text-md text-neutral-400 hover:text-neutral-200'>
          <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
            <polyline points='7 10 12 15 17 10' />
            <line x1='12' y1='15' x2='12' y2='3' />
          </svg>
          Nhập/Xuất
        </button>
        <Button className='rounded-lg' onClick={onAddChannel}>
          <svg className='size-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            <path d='M5 12h14' />
            <path d='M12 5v14' />
          </svg>
          Thêm kênh
        </Button>
      </div>
    </div>
  );
}
