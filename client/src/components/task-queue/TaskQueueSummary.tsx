interface TaskQueueSummaryProps {
  running: number;
  queued: number;
  failed: number;
}

export function TaskQueueSummary({ running, queued, failed }: TaskQueueSummaryProps) {
  return (
    <p className="text-xs text-neutral-500">
      {running} Running · {queued} Queued · {failed} Failed
    </p>
  );
}
