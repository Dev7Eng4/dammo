import { useTranslation } from 'react-i18next';

interface TaskQueueSummaryProps {
  running: number;
  queued: number;
  failed: number;
}

export function TaskQueueSummary({ running, queued, failed }: TaskQueueSummaryProps) {
  const { t } = useTranslation('factory');

  return (
    <p className="text-xs text-neutral-500">
      {t('queue.summary', { running, queued, failed })}
    </p>
  );
}
