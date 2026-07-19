import { cn } from '../../lib/cn';
import type { YoutubeChannelVideo } from '../../types/youtubeChannel';
import { countYoutubeChannelVideosByStatus } from '../../utils/youtubeChannelVideos';

interface YoutubeChannelVideoSummaryProps {
  videos: YoutubeChannelVideo[];
  loading?: boolean;
}

const summaryItems = [
  { key: 'Created' as const, label: 'Đã tạo' },
  { key: 'Prepared' as const, label: 'Đã chuẩn bị' },
];

export function YoutubeChannelVideoSummary({ videos, loading }: YoutubeChannelVideoSummaryProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {summaryItems.map((item) => {
        const value = countYoutubeChannelVideosByStatus(videos, item.key);
        return (
          <div key={item.key} className="card-surface min-w-[8.5rem] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              {item.label}
            </p>
            <p
              className={cn(
                'mt-2 text-2xl font-semibold text-neutral-50',
                loading && 'animate-pulse text-neutral-700',
              )}
            >
              {loading ? '—' : value.toLocaleString('vi-VN')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
