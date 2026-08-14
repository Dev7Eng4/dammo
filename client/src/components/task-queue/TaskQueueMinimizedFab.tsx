function TaskQueueStackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <rect x="8" y="8" width="12" height="12" rx="2" />
    </svg>
  );
}

interface TaskQueueMinimizedFabProps {
  activeCount: number;
  onClick: () => void;
}

export function TaskQueueMinimizedFab({ activeCount, onClick }: TaskQueueMinimizedFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-full border border-border bg-surface-elevated text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      aria-label={
        activeCount > 0
          ? `Mở hàng đợi công việc, ${activeCount} đang chạy`
          : 'Mở hàng đợi công việc'
      }
    >
      <TaskQueueStackIcon className="size-5" />
      {activeCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-400 px-1 text-[10px] font-semibold leading-none text-white">
          {activeCount > 99 ? '99+' : activeCount}
        </span>
      ) : null}
    </button>
  );
}
