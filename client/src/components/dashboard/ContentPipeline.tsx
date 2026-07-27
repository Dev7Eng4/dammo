import { cn } from '../../lib/cn';
import type { PipelineStep } from '../../types/dashboard';

interface ContentPipelineProps {
  steps: PipelineStep[];
  loading?: boolean;
}

const highlightBorder: Record<string, string> = {
  info: 'border-info',
  success: 'border-success',
  danger: 'border-danger',
};

export function ContentPipeline({ steps, loading }: ContentPipelineProps) {
  if (loading) {
    return (
      <div className="card-surface p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Luồng nội dung</p>
        <div className="flex animate-pulse gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 flex-1 rounded-lg bg-neutral-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Luồng nội dung</p>
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                'flex min-w-[90px] flex-col items-center rounded-lg border px-3 py-2',
                step.highlight
                  ? cn('border-2 bg-surface-elevated', highlightBorder[step.highlight])
                  : 'border-border bg-surface',
              )}
            >
              <span className="text-lg font-semibold text-neutral-50">{step.count}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <svg className="size-3 shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
