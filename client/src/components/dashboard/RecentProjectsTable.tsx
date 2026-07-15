import { type ColumnDef } from '@tanstack/react-table';
import type { RecentProject } from '../../types/dashboard';
import { Badge, DataTable } from '../ui';

interface RecentProjectsTableProps {
  projects: RecentProject[];
  loading?: boolean;
}

export function RecentProjectsTable({ projects, loading }: RecentProjectsTableProps) {
  const columns: ColumnDef<RecentProject, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Project Name',
      cell: ({ getValue }) => <span className="text-neutral-100">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'format',
      header: 'Format',
      cell: ({ getValue }) => <span className="text-neutral-400">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'target',
      header: 'Target',
      cell: ({ getValue }) => <span className="text-neutral-400">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge status={row.original.status} />,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
  ];

  return (
    <div className="card-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Recent Projects</p>
        <button type="button" className="text-xs text-secondary-400 hover:text-secondary-300">
          View All
        </button>
      </div>
      <DataTable
        data={projects}
        columns={columns}
        getRowId={project => project.id}
        loading={loading}
        emptyMessage="No recent projects."
      />
    </div>
  );
}
