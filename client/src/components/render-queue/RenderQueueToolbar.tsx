import { Button } from '../ui';

interface RenderQueueToolbarProps {
  queuePaused?: boolean;
  actionsDisabled?: boolean;
  onStartQueue?: () => void;
  onPauseQueue?: () => void;
  onClearCompleted?: () => void;
  onRetryFailed?: () => void;
  onOpenRendersFolder?: () => void;
}

export function RenderQueueToolbar({
  queuePaused,
  actionsDisabled = false,
  onStartQueue,
  onPauseQueue,
  onClearCompleted,
  onRetryFailed,
  onOpenRendersFolder,
}: RenderQueueToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-neutral-400">Render Queue</span>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onStartQueue}
          disabled={actionsDisabled}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Start Queue
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onPauseQueue}
          disabled={actionsDisabled}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
          {queuePaused ? 'Resume Queue' : 'Pause Queue'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onClearCompleted}
          disabled={actionsDisabled}
        >
          Clear Completed
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onRetryFailed}
          disabled={actionsDisabled}
        >
          Retry Failed
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onOpenRendersFolder}
          disabled={actionsDisabled}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open Renders Folder
        </Button>
      </div>
    </div>
  );
}
