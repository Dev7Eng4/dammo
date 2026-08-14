import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import {
  formatTaskTimestamp,
  getTaskDetailLine,
  getTaskOutputPath,
  getTaskProgressValue,
  getTaskSourceId,
} from '../../utils/taskQueue';
import type { TaskJobListItem } from '../../types/taskQueue';
import { Button, Progress } from '../ui';
import { TaskJobStatusBadge } from './TaskJobStatusBadge';
import { TaskJobTypeBadge } from './TaskJobTypeBadge';
import { TaskStageChecklist } from './TaskStageChecklist';

interface TaskJobCardProps {
  job: TaskJobListItem;
  selected?: boolean;
  onSelect?: (job: TaskJobListItem) => void;
  onCancel?: (id: string) => void;
  onRetry?: (job: TaskJobListItem) => void;
  onCopyPath?: (path: string) => void;
}

function TaskJobIcon({ job }: { job: TaskJobListItem }) {
  const isFailed = job.status === 'failed';
  const isSuccess = job.status === 'completed';
  const isVideo = job.type === 'create_video' || job.type === 'upload_video' || job.type === 'download_source';
  const isUpload = job.type === 'upload_video';

  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl',
        isFailed && 'bg-danger/15 text-danger',
        isSuccess && 'bg-success/15 text-success',
        !isFailed && !isSuccess && isVideo && 'bg-primary-500/15 text-primary-400',
        !isFailed && !isSuccess && !isVideo && 'bg-neutral-800 text-neutral-300',
      )}
    >
      {isFailed ? (
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 0010 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      ) : isSuccess ? (
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
      ) : isUpload ? (
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M10 3v10" />
          <path d="M6 7l4-4 4 4" />
          <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
        </svg>
      ) : isVideo ? (
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
          <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h13.5A2.25 2.25 0 0019 13.75v-7.5A2.25 2.25 0 0016.75 4H3.25zM4.5 7.75v4.5l6-2.25-6-2.25z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
          <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z" />
        </svg>
      )}
    </div>
  );
}

function progressBarClass(status: TaskJobListItem['status']): string {
  if (status === 'failed') return 'bg-danger';
  if (status === 'completed') return 'bg-success';
  return 'bg-primary-400';
}

export function TaskJobCard({ job, selected, onSelect, onCancel, onRetry, onCopyPath }: TaskJobCardProps) {
  const detail = getTaskDetailLine(job);
  const progress = getTaskProgressValue(job);
  const outputPath = getTaskOutputPath(job);
  const sourceId = getTaskSourceId(job);
  const isFailed = job.status === 'failed';
  const showProgress = job.status === 'running' || job.status === 'completed' || job.status === 'failed';
  const isSelectable = Boolean(onSelect);
  const stages = job.stages ?? [];
  const hasStages = stages.length > 0;

  function handleCardClick() {
    if (isSelectable) onSelect?.(job);
  }

  return (
    <article
      role={isSelectable ? 'button' : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? handleCardClick : undefined}
      onKeyDown={
        isSelectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.(job);
              }
            }
          : undefined
      }
      className={cn(
        'card-surface rounded-2xl px-5 py-4',
        isSelectable && 'cursor-pointer transition-colors hover:bg-surface-elevated/50',
        selected && 'ring-2 ring-primary-500',
      )}
    >
      <div className="flex items-start gap-4">
        <TaskJobIcon job={job} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn('text-sm font-semibold', isFailed ? 'text-danger' : 'text-neutral-100')}>
              {job.title}
            </h2>
            <TaskJobTypeBadge type={job.type} />
          </div>
          <p
            className={cn(
              'mt-1 truncate text-xs',
              isFailed ? 'text-danger/80' : 'text-neutral-500',
            )}
            title={detail}
          >
            {detail}
          </p>

          {showProgress ? (
            hasStages ? (
              <TaskStageChecklist
                stages={stages}
                compact={job.status === 'running'}
                showFailedDetails={isFailed}
              />
            ) : (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
                  <span className="truncate">
                    {job.status === 'failed'
                    ? `Bước: ${job.progressLabel ?? 'Đang xử lý'}`
                    : job.progressLabel ?? (job.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý')}
                  </span>
                  <span className="shrink-0">{progress}%</span>
                </div>
                {job.status === 'failed' ? (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', progressBarClass(job.status))}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : job.status === 'completed' ? (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-success transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : (
                  <Progress value={progress} tone="primary" />
                )}
              </div>
            )
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-xs text-neutral-500">{formatTaskTimestamp(job.updatedAt)}</span>
          <TaskJobStatusBadge status={job.status} />

          <div className="mt-1 flex items-center gap-2">
            {job.status === 'queued' && onCancel ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel(job.id);
                }}
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                aria-label="Hủy công việc"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                  <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                </svg>
              </button>
            ) : null}

            {job.status === 'failed' && onRetry ? (
              <Button
                variant="outlined"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry(job);
                }}
              >
                <svg viewBox="0 0 20 20" className="mr-1 size-3.5" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466 5.5 5.5 0 01-1.312-6.045 5.5 5.5 0 011.84-2.066V4.5a.75.75 0 011.28-.53l2.8 2.8a.75.75 0 010 1.06l-2.8 2.8a.75.75 0 01-1.28-.53v-1.339z"
                    clipRule="evenodd"
                  />
                </svg>
                Thử lại
              </Button>
            ) : null}

            {job.status === 'completed' && outputPath && onCopyPath ? (
              <Button
                variant="outlined"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyPath(outputPath);
                }}
              >
                <svg viewBox="0 0 20 20" className="mr-1 size-3.5" fill="currentColor" aria-hidden>
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                Đường dẫn
              </Button>
            ) : null}

            {job.status === 'completed' && sourceId ? (
              <Link
                to={`/source-channels/${sourceId}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-neutral-300 hover:bg-surface-elevated"
              >
                Xem
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
