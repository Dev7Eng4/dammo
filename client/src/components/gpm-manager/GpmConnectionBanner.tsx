import { cn } from '../../lib/cn';
import type { GpmConnectionStatus } from '../../types/gpm';

interface GpmConnectionBannerProps {
  status: GpmConnectionStatus | null;
  loading?: boolean;
  className?: string;
}

export function GpmConnectionBanner({ status, loading, className }: GpmConnectionBannerProps) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-surface px-4 py-3', className)}>
        <div className="h-4 w-48 animate-pulse rounded bg-neutral-800" />
      </div>
    );
  }

  if (!status) return null;

  if (status.connected) {
    return (
      <div
        className={cn(
          'rounded-xl border border-success/30 bg-success/5 px-4 py-3',
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <span className="size-2 rounded-full bg-success" />
            Connected to GPM
          </span>
          {status.sender ? (
            <span className="text-xs text-neutral-400">{status.sender}</span>
          ) : null}
          <span className="font-mono text-xs text-neutral-500">{status.baseUrl}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-warning/40 bg-warning/5 px-4 py-3',
        className,
      )}
    >
      <p className="text-sm font-medium text-warning">GPM app not reachable</p>
      <p className="mt-1 text-xs text-neutral-400">
        {status.message ?? 'Start GPMLogin and ensure the Local API is running.'}
      </p>
      <p className="mt-1 font-mono text-xs text-neutral-500">{status.baseUrl}</p>
    </div>
  );
}
