import { cn } from '../../lib/cn';
import type { ProxyStatus } from '../../types/proxy';

const statusConfig: Record<
  ProxyStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  active: {
    label: 'Hoạt động',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  failed: {
    label: 'Thất bại',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
  slow: {
    label: 'Chậm',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  expired: {
    label: 'Hết hạn',
    dot: 'bg-neutral-500',
    text: 'text-neutral-400',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
  in_use: {
    label: 'Đang dùng',
    dot: 'bg-primary-400',
    text: 'text-primary-400',
    bg: 'bg-primary-500/10 border-primary-500/30',
  },
};

interface ProxyStatusPillProps {
  status: ProxyStatus;
  className?: string;
}

export function ProxyStatusPill({ status, className }: ProxyStatusPillProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase',
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
