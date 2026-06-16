import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';
import type { RecentProject } from '../../types/dashboard';

interface RecentProjectsTableProps {
  projects: RecentProject[];
  loading?: boolean;
}

export function RecentProjectsTable({ projects, loading }: RecentProjectsTableProps) {
  return (
    <div className="card-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Recent Projects</p>
        <button type="button" className="text-xs text-secondary-400 hover:text-secondary-300">
          View All
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-2 pr-4 font-medium">Project Name</th>
              <th className="pb-2 pr-4 font-medium">Format</th>
              <th className="pb-2 pr-4 font-medium">Target</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={4} className="py-3">
                      <div className="h-4 animate-pulse rounded bg-neutral-800" />
                    </td>
                  </tr>
                ))
              : projects.map((project) => (
                  <tr key={project.id} className="border-b border-border/50 last:border-0">
                    <td className={cn('py-2.5 pr-4 text-neutral-100')}>{project.name}</td>
                    <td className="py-2.5 pr-4 text-neutral-400">{project.format}</td>
                    <td className="py-2.5 pr-4 text-neutral-400">{project.target}</td>
                    <td className="py-2.5">
                      <Badge status={project.status} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
