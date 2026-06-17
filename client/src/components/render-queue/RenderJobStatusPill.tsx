import { cn } from '../../lib/cn';
import type { RenderJobStatus } from '../../types/videoProduction';

const statusConfig: Record<
  RenderJobStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  running: {
    label: 'Running',
    dotClass: 'bg-secondary-400',
    textClass: 'text-secondary-300',
  },
  queued: {
    label: 'Queued',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-danger',
    textClass: 'text-danger',
  },
  success: {
    label: 'Success',
    dotClass: 'bg-success',
    textClass: 'text-success',
  },
};

interface RenderJobStatusPillProps {
  status: RenderJobStatus;
  className?: string;
}

export function RenderJobStatusPill({ status, className }: RenderJobStatusPillProps) {
  const config = statusConfig[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', config.textClass, className)}>
      <span className={cn('size-2 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  );
}
