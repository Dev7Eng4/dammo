import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { getTaskDetailLine } from '../../utils/taskQueue';
import type { TaskJob, TaskLogEntry } from '../../types/taskQueue';
import { Drawer } from '../ui';

interface TaskJobDetailDrawerProps {
  open: boolean;
  job: TaskJob | null;
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

export function TaskJobDetailDrawer({ open, job, onClose }: TaskJobDetailDrawerProps) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const logs = job?.logs ?? [];
  const panelTitle = job?.status === 'running' ? 'Live Output' : 'Job Detail';
  const subtitle = [panelTitle, job?.livePhase].filter(Boolean).join(' · ');

  useEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    const scrollParent = el.parentElement;
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }, [logs.length, job?.updatedAt]);

  if (!job) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={job.title}
      subtitle={subtitle}
      placement="overlay"
      widthClassName="w-full max-w-sm lg:w-96 xl:w-[28rem]"
      headerActions={logs.length > 0 ? <CopyButton value={formatLogText(logs)} /> : null}
    >
      <div
        ref={consoleRef}
        className="min-h-full bg-neutral-900 p-4 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <p
            className={cn(
              'whitespace-pre-wrap break-all',
              job.status === 'failed' ? 'text-danger' : 'text-neutral-500',
            )}
          >
            {getEmptyPanelMessage(job)}
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
    </Drawer>
  );
}
