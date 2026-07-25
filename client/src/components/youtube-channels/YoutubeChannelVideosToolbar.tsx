import { DropdownSelect } from '../ui';
import {
  YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS,
  type YoutubeChannelVideoStatusFilter,
} from '../../types/youtubeChannel';

interface YoutubeChannelVideosToolbarProps {
  statusFilter: YoutubeChannelVideoStatusFilter;
  onStatusFilterChange: (value: YoutubeChannelVideoStatusFilter) => void;
  nextUploadAt?: string | null;
}

function formatNextUploadAt(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

export function YoutubeChannelVideosToolbar({
  statusFilter,
  onStatusFilterChange,
  nextUploadAt,
}: YoutubeChannelVideosToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-sm text-neutral-400">
        Schedule tiếp theo: <span className="text-neutral-200">{formatNextUploadAt(nextUploadAt)}</span>
      </p>
      <DropdownSelect
        options={YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
      />
    </div>
  );
}
