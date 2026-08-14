import { useNavigate } from 'react-router-dom';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskQueueItem } from './TaskQueueItem';
import { TaskQueueMinimizedFab } from './TaskQueueMinimizedFab';
import { TaskQueueSummary } from './TaskQueueSummary';

export function TaskQueuePopup() {
  const {
    jobs,
    summary,
    popupView,
    setPopupView,
    cancelJob,
  } = useTaskQueue();

  const navigate = useNavigate();
  const activeCount = summary.running + summary.queued;

  function openFullQueue() {
    setPopupView('closed');
    navigate('/task-queue');
  }

  if (popupView === 'closed') return null;

  if (popupView === 'minimized') {
    return (
      <TaskQueueMinimizedFab activeCount={activeCount} onClick={() => setPopupView('open')} />
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Hàng đợi công việc</h2>
            <TaskQueueSummary
              running={summary.running}
              queued={summary.queued}
              failed={summary.failed}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              onClick={() => setPopupView('minimized')}
              aria-label="Thu nhỏ"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              onClick={openFullQueue}
              aria-label="Mở rộng"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M3.75 3A1.75 1.75 0 002 4.75v3.5a.75.75 0 001.5 0V5.56l4.97 4.97a.75.75 0 101.06-1.06L4.56 4.5h2.69a.75.75 0 000-1.5h-3.5zM16.25 17A1.75 1.75 0 0018 15.25v-3.5a.75.75 0 00-1.5 0v2.69l-4.97-4.97a.75.75 0 00-1.06 1.06l4.97 4.97h-2.69a.75.75 0 000 1.5h3.5z" />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              onClick={() => setPopupView('closed')}
              aria-label="Đóng"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
        {jobs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Chưa có công việc</p>
        ) : (
          jobs.slice(0, 8).map((job) => (
            <TaskQueueItem
              key={job.id}
              job={job}
              onCancel={job.status === 'queued' ? (id) => void cancelJob(id) : undefined}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={openFullQueue}
          className="text-xs font-medium text-primary-400 hover:text-primary-300"
        >
          Mở hàng đợi đầy đủ →
        </button>
      </div>
    </div>
  );
}
