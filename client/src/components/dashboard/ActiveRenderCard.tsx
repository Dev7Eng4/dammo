import { Progress } from '../ui';
import type { ActiveRender } from '../../types/dashboard';

interface ActiveRenderCardProps {
  data: ActiveRender;
  loading?: boolean;
}

export function ActiveRenderCard({ data, loading }: ActiveRenderCardProps) {
  return (
    <div className="card-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Đang render</p>
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-3/4 rounded bg-neutral-800" />
          <div className="h-2 rounded bg-neutral-800" />
          <div className="h-3 w-1/2 rounded bg-neutral-800" />
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-neutral-100">{data.fileName}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
            <span>{data.progress}%</span>
            <span>Còn lại {data.eta}</span>
          </div>
          <Progress value={data.progress} tone="secondary" className="mt-1" />
          <p className="mt-3 truncate font-mono text-[10px] text-neutral-500">{data.filePath}</p>
        </>
      )}
    </div>
  );
}
