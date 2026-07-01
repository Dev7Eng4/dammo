import { Button, Progress } from '../ui';
import type { TaskJobListItem } from '../../types/taskQueue';

interface TaskQueueItemProps {
  job: TaskJobListItem;
  onCancel?: (id: string) => void;
}

function TaskIcon({ job }: { job: TaskJobListItem }) {
  if (job.status === 'failed') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 0010 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }

  if (job.status === 'completed') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }

  if (job.type === 'upload_video') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M10 3v10" />
          <path d="M6 7l4-4 4 4" />
          <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
        </svg>
      </div>
    );
  }

  if (job.type === 'create_video') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-400">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h13.5A2.25 2.25 0 0019 13.75v-7.5A2.25 2.25 0 0016.75 4H3.25zM4.5 7.75v4.5l6-2.25-6-2.25z" />
        </svg>
      </div>
    );
  }

  if (job.type === 'download_source') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-500/15 text-secondary-400">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M10 3v10" />
          <path d="M6 11l4 4 4-4" />
          <path d="M4 16h12" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z" />
      </svg>
    </div>
  );
}

export function TaskQueueItem({ job, onCancel }: TaskQueueItemProps) {
  const isFailed = job.status === 'failed';
  const isRunning = job.status === 'running';
  const isQueued = job.status === 'queued';

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <TaskIcon job={job} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${isFailed ? 'text-danger' : 'text-neutral-100'}`}>
                {job.title}
              </p>
              {job.subtitle ? (
                <p className={`truncate text-xs ${isFailed ? 'text-danger/80' : 'text-neutral-500'}`}>
                  {isFailed && job.error ? job.error : job.subtitle}
                </p>
              ) : isFailed && job.error ? (
                <p className="truncate text-xs text-danger/80">{job.error}</p>
              ) : null}
            </div>
            {isQueued ? (
              <span className="shrink-0 text-neutral-500" title="Queued">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            ) : null}
            {isRunning && onCancel ? (
              <Button
                variant="outlined"
                size="sm"
                className="h-7 shrink-0 rounded-md px-2 text-xs"
                onClick={() => onCancel(job.id)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
          {isRunning ? (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span className="truncate">{job.progressLabel ?? 'Processing'}</span>
                <span className="shrink-0">{job.progress}%</span>
              </div>
              <Progress value={job.progress} tone="primary" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
