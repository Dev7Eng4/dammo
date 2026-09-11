import { Progress } from '../ui'
import type { ActiveRender } from '../../types/dashboard'

interface ActiveRenderCardProps {
  data: ActiveRender
  loading?: boolean
}

export function ActiveRenderCard({ data, loading }: ActiveRenderCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-4 text-sm font-medium text-muted-foreground">Đang render</p>
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-2 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      ) : (
        <>
          <p className="text-base font-semibold text-foreground">{data.fileName || '—'}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.progress}%</span>
            <span>Còn lại {data.eta || '—'}</span>
          </div>
          <Progress value={data.progress} tone="secondary" className="mt-1.5" />
          <p className="mt-3 truncate font-mono text-xs text-muted-foreground">{data.filePath || '—'}</p>
        </>
      )}
    </div>
  )
}
