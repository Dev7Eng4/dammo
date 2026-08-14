import { cn } from '../../lib/cn';
import type { PlatformLinkStatus } from '../../types/mailAccount';

interface PlatformLinkCellProps {
  status: PlatformLinkStatus;
  className?: string;
}

const statusConfig: Record<
  Exclude<PlatformLinkStatus, 'none'>,
  { label: string; dot: string; text: string; bg: string }
> = {
  active: {
    label: 'Active',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  deleted: {
    label: 'Xóa',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

export function PlatformLinkCell({ status, className }: PlatformLinkCellProps) {
  if (status === 'none') {
    return <span className={cn('text-neutral-500', className)}>—</span>;
  }

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
