import { cn } from '../../lib/cn';
import type { ProjectStatus } from '../../types/dashboard';

const statusStyles: Record<ProjectStatus, string> = {
  success: 'bg-success/15 text-success border-success/30',
  failed: 'bg-danger/15 text-danger border-danger/30',
  rendering: 'bg-info/15 text-info border-info/30',
};

const statusLabels: Record<ProjectStatus, string> = {
  success: 'Success',
  failed: 'Failed',
  rendering: 'Rendering',
};

export interface BadgeProps {
  status: ProjectStatus;
  className?: string;
}

export function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        statusStyles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
