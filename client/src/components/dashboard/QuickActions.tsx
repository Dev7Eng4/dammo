import { Button } from '../ui';

const actions = [
  { label: 'Add Mail', icon: 'mail' },
  { label: 'Add YT Ch.', icon: 'youtube' },
  { label: 'New Project', icon: 'project' },
  { label: 'Import Excel', icon: 'excel' },
];

function ActionIcon({ icon }: { icon: string }) {
  const className = 'size-5 text-neutral-400';
  if (icon === 'mail') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  if (icon === 'youtube') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </svg>
    );
  }
  if (icon === 'project') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function QuickActions() {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Quick Actions</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-transparent px-3 py-4 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-surface-elevated hover:text-neutral-200"
          >
            <ActionIcon icon={action.icon} />
            {action.label}
          </button>
        ))}
      </div>
      <Button className="w-full rounded-lg bg-info text-white hover:bg-info/90">
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        START RENDER QUEUE
      </Button>
    </div>
  );
}
