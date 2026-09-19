import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import type { PlatformLinkStatus } from '../../types/mailAccount';

interface PlatformLinkCellProps {
  status: PlatformLinkStatus;
  className?: string;
}

const statusStyles: Record<
  Exclude<PlatformLinkStatus, 'none'>,
  { dot: string; text: string; bg: string }
> = {
  active: {
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  deleted: {
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

export function PlatformLinkCell({ status, className }: PlatformLinkCellProps) {
  const { t } = useTranslation(['mail', 'common']);

  if (status === 'none') {
    return <span className={cn('text-neutral-500', className)}>—</span>;
  }

  const styles = statusStyles[status];
  const label = status === 'active' ? t('common:status.active') : t('detail.unlink');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        styles.bg,
        styles.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', styles.dot)} />
      {label}
    </span>
  );
}
