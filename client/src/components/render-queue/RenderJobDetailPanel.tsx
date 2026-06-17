import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { RenderJob } from '../../types/videoProduction';
import { Button } from '../ui';
import { Progress } from '../ui/Progress';
import { RenderJobStatusPill } from './RenderJobStatusPill';

interface RenderJobDetailPanelProps {
  job: RenderJob | null;
  onClose: () => void;
  onCancelRender: () => void;
  onOpenProject: () => void;
  onViewOutput: () => void;
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
      title={copied ? 'Copied!' : 'Copy'}
      className="shrink-0 text-neutral-500 hover:text-neutral-300"
    >
      {copied ? (
        <svg className="size-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function RenderJobDetailPanel({
  job,
  onClose,
  onCancelRender,
  onOpenProject,
  onViewOutput,
}: RenderJobDetailPanelProps) {
  if (!job) return null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface lg:w-96 xl:w-[28rem]">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-neutral-100">{job.id}</h2>
            <RenderJobStatusPill status={job.status} />
          </div>
          <p className="mt-1 truncate text-sm text-neutral-400">{job.projectName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-neutral-500 hover:text-neutral-300 lg:hidden"
          aria-label="Close panel"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Command</p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
            {job.command}
          </pre>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Rendering Progress
          </p>
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-semibold text-neutral-100">
              {job.framesDone.toLocaleString()}{' '}
              <span className="text-base font-normal text-neutral-500">
                / {job.framesTotal.toLocaleString()} ({job.progress}%)
              </span>
            </p>
          </div>
          <Progress value={job.progress} tone="secondary" className="mt-3" />
          <div className="mt-2 flex gap-4 text-xs text-neutral-400">
            <span>ETA: {job.eta}</span>
            {job.speedFps > 0 ? <span>Speed: {job.speedFps} fps</span> : null}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Input Integrity
          </p>
          <ul className="space-y-2">
            {job.integrityChecks.map((check) => (
              <li key={check.label} className="flex items-center gap-2 text-sm">
                {check.ok ? (
                  <svg className="size-4 shrink-0 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg className="size-4 shrink-0 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                )}
                <span className={cn(check.ok ? 'text-neutral-300' : 'text-danger')}>{check.label}</span>
              </li>
            ))}
          </ul>
          {job.error ? <p className="mt-2 text-xs text-danger">{job.error}</p> : null}
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Destination Path
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400">{job.destinationPath}</p>
            <CopyButton value={job.destinationPath} />
          </div>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Console Output</p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-400">
            {job.logs.map((line, index) => (
              <p key={`${line}-${index}`} className={line.includes('[error]') ? 'text-danger' : undefined}>
                {line}
              </p>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-2 border-t border-border p-4">
        <Button
          variant="outlined"
          size="sm"
          className="w-full rounded-lg border-danger/50 text-danger hover:bg-danger/10"
          onClick={onCancelRender}
          disabled={job.status !== 'running' && job.status !== 'queued'}
        >
          Cancel Render
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onOpenProject}>
            Open Project
          </Button>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onViewOutput}>
            View Output
          </Button>
        </div>
      </div>
    </aside>
  );
}
