import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { getTaskDetailLine } from '../../utils/taskQueue';
import type { TaskJob, TaskLogEntry } from '../../types/taskQueue';

interface TaskJobLiveOutputPanelProps {
  job: TaskJob;
  onClose: () => void;
}

function logLevelLabel(level: TaskLogEntry['level']): string {
  return level.toUpperCase();
}

function logLineClass(level: TaskLogEntry['level']): string {
  if (level === 'err') return 'text-danger';
  if (level === 'exec' || level === 'ok') return 'text-secondary-400';
  return 'text-neutral-300';
}

function formatLogText(logs: TaskLogEntry[]): string {
  return logs
    .map((entry) => `${entry.at} [${logLevelLabel(entry.level)}] ${entry.message}`)
    .join('\n');
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-neutral-300 hover:bg-surface-elevated"
    >
      {copied ? (
        <svg className="size-3.5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function getEmptyPanelMessage(job: TaskJob): string {
  if (job.status === 'running') {
    const label = job.progressLabel ?? 'Processing';
    return `${label} (${job.progress}%)`;
  }
  if (job.status === 'failed') {
    return job.error ?? 'Task failed';
  }
  if (job.status === 'completed') {
    return getTaskDetailLine(job);
  }
  if (job.status === 'queued') {
    return 'Pending worker availability';
  }
  return 'No output available';
}

export function TaskJobLiveOutputPanel({ job, onClose }: TaskJobLiveOutputPanelProps) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const logs = job.logs ?? [];
  const panelTitle = job.status === 'running' ? 'Live Output' : 'Job Detail';
  const emptyMessage = getEmptyPanelMessage(job);

  useEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length, job.updatedAt]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface lg:w-96 xl:w-[28rem]">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{panelTitle}</p>
          <h2 className="mt-1 truncate text-sm font-semibold text-neutral-100">{job.title}</h2>
          {job.livePhase ? (
            <p className="mt-0.5 text-xs capitalize text-neutral-500">{job.livePhase}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {logs.length > 0 ? <CopyButton value={formatLogText(logs)} /> : null}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-neutral-500 hover:text-neutral-300"
            aria-label="Close panel"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={consoleRef}
        className="flex-1 overflow-y-auto bg-neutral-900 p-4 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <p
            className={cn(
              'whitespace-pre-wrap break-all',
              job.status === 'failed' ? 'text-danger' : 'text-neutral-500',
            )}
          >
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-0.5">
            {logs.map((entry, index) => (
              <p key={`${entry.at}-${index}`} className={cn('whitespace-pre-wrap break-all', logLineClass(entry.level))}>
                <span className="text-neutral-500">{entry.at}</span>{' '}
                <span className="text-neutral-400">[{logLevelLabel(entry.level)}]</span> {entry.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
