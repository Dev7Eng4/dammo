import { cn } from '../../lib/cn';
import type { TaskStatus } from '../../types/taskQueue';

const statusConfig: Record<
  TaskStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  running: {
    label: 'Running',
    dotClass: 'bg-primary-400',
    textClass: 'text-primary-300',
  },
  completed: {
    label: 'Success',
    dotClass: 'bg-success',
    textClass: 'text-success',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-danger',
    textClass: 'text-danger',
  },
  queued: {
    label: 'Queued',
    dotClass: 'bg-neutral-500',
    textClass: 'text-neutral-400',
  },
  cancelled: {
    label: 'Cancelled',
    dotClass: 'bg-neutral-600',
    textClass: 'text-neutral-500',
  },
};

interface TaskJobStatusBadgeProps {
  status: TaskStatus;
}

export function TaskJobStatusBadge({ status }: TaskJobStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', config.textClass)}>
      <span className={cn('size-1.5 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  );
}
