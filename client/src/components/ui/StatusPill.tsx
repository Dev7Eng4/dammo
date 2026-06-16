import { cn } from '../../lib/cn';
import type { MailAccountStatus } from '../../types/mailAccount';

const statusConfig: Record<
  MailAccountStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  active: {
    label: 'Active',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  need_verify: {
    label: 'Need Verify',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  suspended: {
    label: 'Suspended',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

export interface StatusPillProps {
  status: MailAccountStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
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
