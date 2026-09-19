import { useTranslation } from 'react-i18next';
import type { TaskType } from '../../types/taskQueue';

const TYPE_KEYS: Record<TaskType, string> = {
  add_source: 'queue.type.importSource',
  create_video: 'queue.type.createVideo',
  upload_video: 'queue.type.uploadVideo',
  download_source: 'queue.type.downloadSource',
};

interface TaskJobTypeBadgeProps {
  type: TaskType;
}

export function TaskJobTypeBadge({ type }: TaskJobTypeBadgeProps) {
  const { t } = useTranslation('factory');

  return (
    <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-400">
      {t(TYPE_KEYS[type])}
    </span>
  );
}
