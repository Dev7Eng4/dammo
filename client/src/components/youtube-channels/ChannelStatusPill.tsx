import { cn } from '../../lib/cn';
import type { YoutubeChannelStatus } from '../../types/youtubeChannel';

const statusConfig: Record<
  YoutubeChannelStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  active: {
    label: 'Đang hoạt động',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  suspended: {
    label: 'Đã đình chỉ',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

interface ChannelStatusPillProps {
  status: YoutubeChannelStatus;
  className?: string;
}

export function ChannelStatusPill({ status, className }: ChannelStatusPillProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
}
