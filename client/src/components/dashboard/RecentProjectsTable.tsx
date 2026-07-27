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
      header: 'Tên dự án',
      cell: ({ getValue }) => <span className="text-neutral-100">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'format',
      header: 'Định dạng',
      cell: ({ getValue }) => <span className="text-neutral-400">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'target',
      header: 'Đích',
      cell: ({ getValue }) => <span className="text-neutral-400">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ row }) => <Badge status={row.original.status} />,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
  ];

  return (
    <div className="card-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Dự án gần đây</p>
        <button type="button" className="text-xs text-secondary-400 hover:text-secondary-300">
          Xem tất cả
        </button>
      </div>
      <DataTable
        data={projects}
        columns={columns}
        getRowId={project => project.id}
        loading={loading}
        emptyMessage="Chưa có dự án gần đây."
      />
    </div>
  );
}
