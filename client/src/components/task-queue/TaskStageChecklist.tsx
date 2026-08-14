import { cn } from '../../lib/cn';
import type { TaskErrorDetails, TaskStage } from '../../types/taskQueue';

function stageMarker(status: TaskStage['status']): string {
  if (status === 'done') return '✓';
  if (status === 'doing') return '●';
  if (status === 'failed') return '✗';
  if (status === 'skipped') return '–';
  return '○';
}

function stageStatusLabel(status: TaskStage['status']): string {
  if (status === 'done') return 'xong';
  if (status === 'doing') return 'đang làm';
  if (status === 'failed') return 'lỗi';
  if (status === 'skipped') return 'bỏ qua';
  return '';
}

export function TaskErrorDetailsBlock({
  error,
  errorDetails,
  compact = false,
}: {
  error?: string;
  errorDetails?: TaskErrorDetails;
  compact?: boolean;
}) {
  if (!error && !errorDetails) return null;

  return (
    <div className={cn('space-y-1', compact ? 'mt-1' : 'mt-2')}>
      {error ? (
        <p className={cn('whitespace-pre-wrap break-words text-danger', compact ? 'text-[11px]' : 'text-xs')}>
          {error}
        </p>
      ) : null}
      {errorDetails?.reason ? (
        <p className="text-[11px] text-danger/90">Lý do: {errorDetails.reason}</p>
      ) : null}
      {errorDetails?.missingFields?.length ? (
        <p className="text-[11px] text-danger/90">Thiếu: {errorDetails.missingFields.join(', ')}</p>
      ) : null}
      {errorDetails?.context ? (
        <p className="text-[11px] text-neutral-400">Ngữ cảnh: {errorDetails.context}</p>
      ) : null}
      {errorDetails?.snippet && !compact ? (
        <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-neutral-950 p-2 text-[10px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-all">
          {errorDetails.snippet}
        </pre>
      ) : null}
    </div>
  );
}

export function TaskStageChecklist({
  stages,
  compact = false,
  showFailedDetails = true,
}: {
  stages: TaskStage[];
  compact?: boolean;
  showFailedDetails?: boolean;
}) {
  const visible = compact
    ? stages.filter(stage => stage.status === 'done' || stage.status === 'doing' || stage.status === 'failed')
    : stages.filter(stage => stage.status !== 'skipped');

  if (visible.length === 0) return null;

  return (
    <ul className={cn('space-y-1', compact ? 'mt-2' : 'mt-3')}>
      {visible.map(stage => {
        const isFailed = stage.status === 'failed';
        const isDoing = stage.status === 'doing';
        const isDone = stage.status === 'done';
        const statusText = stageStatusLabel(stage.status);

        return (
          <li key={stage.id} className="min-w-0">
            <div
              className={cn(
                'flex items-start gap-2 text-xs',
                isFailed && 'text-danger',
                isDoing && 'text-primary-300',
                isDone && 'text-neutral-400',
                !isFailed && !isDoing && !isDone && 'text-neutral-600',
              )}
            >
              <span className="mt-0.5 w-3 shrink-0 text-center font-medium" aria-hidden>
                {stageMarker(stage.status)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {stage.label}
                {statusText ? ` — ${statusText}` : ''}
              </span>
            </div>
            {showFailedDetails && isFailed ? (
              <div className="ml-5">
                <TaskErrorDetailsBlock
                  error={stage.error}
                  errorDetails={stage.errorDetails}
                  compact={compact}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
