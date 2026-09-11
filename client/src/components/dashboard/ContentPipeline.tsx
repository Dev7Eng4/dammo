import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { PipelineStep } from '../../types/dashboard'

interface ContentPipelineProps {
  steps: PipelineStep[]
  loading?: boolean
}

const highlightBorder: Record<string, string> = {
  info: 'border-info',
  success: 'border-success',
  danger: 'border-danger',
}

export function ContentPipeline({ steps, loading }: ContentPipelineProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-muted-foreground">Luồng nội dung</p>
        <div className="flex animate-pulse gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 flex-1 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-4 text-sm font-medium text-muted-foreground">Luồng nội dung</p>
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                'flex min-w-[96px] flex-col items-center rounded-xl px-3 py-2.5',
                step.highlight
                  ? cn('border-2 bg-surface-elevated', highlightBorder[step.highlight])
                  : 'border border-border bg-surface-elevated/60',
              )}
            >
              <span className="text-2xl font-semibold tracking-tight text-foreground">{step.count}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{step.label}</span>
            </div>
            {index < steps.length - 1 ? (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
