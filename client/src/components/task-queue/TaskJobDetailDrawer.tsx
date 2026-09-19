import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { getTaskDetailLine } from '../../utils/taskQueue';
import type { TaskJob, TaskLogEntry } from '../../types/taskQueue';
import { Drawer } from '../ui';
import { TaskErrorDetailsBlock, TaskStageChecklist } from './TaskStageChecklist';

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
  const { t } = useTranslation('factory');
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
      {copied ? t('queue.job.copied') : t('queue.job.copy')}
    </button>
  );
}

export function TaskJobDetailDrawer({ open, job, onClose }: TaskJobDetailDrawerProps) {
  const { t, i18n } = useTranslation('factory');
  void i18n.language;
  const consoleRef = useRef<HTMLDivElement>(null);
  const logs = job?.logs ?? [];
  const stages = job?.stages ?? [];
  const failedStage = stages.find((stage) => stage.status === 'failed');
  const panelTitle =
    job?.status === 'running' ? t('queue.job.detailLive') : t('queue.job.detail');
  const subtitle = [panelTitle, job?.livePhase].filter(Boolean).join(' · ');

  function formatErrorCopyText(current: TaskJob): string {
    const failed = current.stages?.find((stage) => stage.status === 'failed');
    const details = failed?.errorDetails ?? current.errorDetails;
    const lines = [
      failed ? t('queue.job.stepLabel', { label: failed.label }) : null,
      failed?.error ?? current.error,
      details?.reason ? t('queue.stage.reason', { reason: details.reason }) : null,
      details?.missingFields?.length
        ? t('queue.stage.missing', { fields: details.missingFields.join(', ') })
        : null,
      details?.context ? t('queue.stage.context', { context: details.context }) : null,
      details?.snippet ? t('queue.stage.snippet', { snippet: details.snippet }) : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  function getEmptyPanelMessage(current: TaskJob): string {
    if (current.status === 'running') {
      const doing = current.stages?.find((stage) => stage.status === 'doing');
      if (doing) return t('queue.job.doingLabel', { label: doing.label });
      const label = current.progressLabel ?? t('queue.job.processing');
      return t('queue.job.progressPct', { label, progress: current.progress });
    }
    if (current.status === 'failed') {
      return current.error ?? t('queue.job.failed');
    }
    if (current.status === 'completed') {
      return getTaskDetailLine(current);
    }
    if (current.status === 'queued') {
      return t('queue.job.waitingWorker');
    }
    return t('queue.job.noData');
  }

  const copyValue =
    job && (failedStage || job.errorDetails)
      ? [formatErrorCopyText(job), logs.length ? `\n---\n${formatLogText(logs)}` : ''].join('')
      : formatLogText(logs);

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
      widthClassName="w-full max-w-xl lg:w-[36rem] xl:w-[42rem]"
      headerActions={logs.length > 0 || failedStage || job.errorDetails ? <CopyButton value={copyValue} /> : null}
    >
      <div className="flex min-h-full flex-col">
        {stages.length > 0 ? (
          <div className="border-b border-border bg-neutral-950 px-4 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              {t('queue.job.steps')}
            </p>
            <TaskStageChecklist stages={stages} showFailedDetails />
            {job.status === 'failed' && !failedStage && (job.error || job.errorDetails) ? (
              <TaskErrorDetailsBlock error={job.error} errorDetails={job.errorDetails} />
            ) : null}
          </div>
        ) : job.status === 'failed' && (job.error || job.errorDetails) ? (
          <div className="border-b border-border bg-neutral-950 px-4 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              {t('queue.job.error')}
            </p>
            <TaskErrorDetailsBlock error={job.error} errorDetails={job.errorDetails} />
          </div>
        ) : null}

        <div
          ref={consoleRef}
          className="min-h-0 flex-1 bg-neutral-900 p-4 font-mono text-[11px] leading-relaxed"
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
      </div>
    </Drawer>
  );
}
