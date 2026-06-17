import { cn } from '../../lib/cn';
import { RENDER_DESTINATION_LABELS } from '../../constants/videoFactory';
import type { RenderDestination, RenderJob } from '../../types/videoProduction';
import { Progress } from '../ui/Progress';
import { RenderJobStatusPill } from './RenderJobStatusPill';

interface RenderQueueTableProps {
  jobs: RenderJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function DestinationIcon({ destination }: { destination: RenderDestination }) {
  if (destination === 'youtube') {
    return (
      <svg className="size-4 text-neutral-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .6 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
      </svg>
    );
  }

  if (destination === 'tiktok') {
    return (
      <svg className="size-4 text-neutral-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
      </svg>
    );
  }

  return (
    <svg className="size-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function RenderQueueTable({ jobs, selectedId, onSelect }: RenderQueueTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">JOB</th>
            <th className="pb-3 pr-4 font-medium">PROJECT</th>
            <th className="pb-3 pr-4 font-medium">TEMPLATE</th>
            <th className="pb-3 pr-4 font-medium">DEST</th>
            <th className="pb-3 pr-4 font-medium">STATUS</th>
            <th className="pb-3 font-medium">PROGRESS</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              onClick={() => onSelect(job.id)}
              className={cn(
                'cursor-pointer border-b border-border/50 transition-colors last:border-0',
                selectedId === job.id ? 'bg-primary-500/10' : 'hover:bg-surface-elevated/50',
              )}
            >
              <td className="py-3 pr-4 font-mono text-xs text-neutral-300">{job.id}</td>
              <td className="py-3 pr-4 font-medium text-neutral-100">{job.projectName}</td>
              <td className="py-3 pr-4 font-mono text-xs text-neutral-400">{job.template}</td>
              <td className="py-3 pr-4" title={RENDER_DESTINATION_LABELS[job.destination]}>
                <DestinationIcon destination={job.destination} />
              </td>
              <td className="py-3 pr-4">
                <RenderJobStatusPill status={job.status} />
              </td>
              <td className="min-w-[10rem] py-3">
                <div className="flex items-center gap-3">
                  <Progress
                    value={job.progress}
                    tone={job.status === 'failed' ? 'neutral' : 'secondary'}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-xs text-neutral-400">{job.progress}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
