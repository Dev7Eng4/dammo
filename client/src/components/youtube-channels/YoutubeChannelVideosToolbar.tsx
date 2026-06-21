import { DropdownSelect } from '../ui';
import {
  YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS,
  type YoutubeChannelVideoStatusFilter,
} from '../../types/youtubeChannel';

interface YoutubeChannelVideosToolbarProps {
  statusFilter: YoutubeChannelVideoStatusFilter;
  onStatusFilterChange: (value: YoutubeChannelVideoStatusFilter) => void;
}

export function YoutubeChannelVideosToolbar({
  statusFilter,
  onStatusFilterChange,
}: YoutubeChannelVideosToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DropdownSelect
        options={YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
      />
    </div>
  );
}
