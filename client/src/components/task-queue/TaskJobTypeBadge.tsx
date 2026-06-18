import { getTaskTypeLabel } from '../../utils/taskQueue';
import type { TaskType } from '../../types/taskQueue';

interface TaskJobTypeBadgeProps {
  type: TaskType;
}

export function TaskJobTypeBadge({ type }: TaskJobTypeBadgeProps) {
  return (
    <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-400">
      {getTaskTypeLabel(type)}
    </span>
  );
}
