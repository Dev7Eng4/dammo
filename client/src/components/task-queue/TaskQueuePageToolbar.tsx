import { Button } from '../ui';

interface TaskQueuePageToolbarProps {
  activeCount: number;
  totalCount: number;
  clearableCount: number;
  clearing: boolean;
  search: string;
  paused: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onClear: () => void;
  onTogglePause: () => void;
}

export function TaskQueuePageToolbar({
  activeCount,
  totalCount,
  clearableCount,
  clearing,
  search,
  paused,
  onSearchChange,
  onRefresh,
  onClear,
  onTogglePause,
}: TaskQueuePageToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-headline text-neutral-100">Active Jobs</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeCount} task{activeCount === 1 ? '' : 's'} in the queue
          {totalCount > activeCount ? ` · ${totalCount} total` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            placeholder="Search jobs..."
            className="h-9 w-56 rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
          />
        </div>
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onRefresh}>
          Refresh
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          disabled={clearableCount === 0 || clearing}
          onClick={onClear}
        >
          {clearing ? 'Clearing...' : 'Clear finished'}
        </Button>
        <Button size="sm" className="rounded-lg" onClick={onTogglePause}>
          {paused ? 'Resume Queue' : 'Pause All'}
        </Button>
      </div>
    </div>
  );
}
