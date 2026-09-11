import { type ColumnDef } from '@tanstack/react-table'
import type { RecentProject } from '../../types/dashboard'
import { Badge, DataTable } from '../ui'

interface RecentProjectsTableProps {
  projects: RecentProject[]
  loading?: boolean
}

export function RecentProjectsTable({ projects, loading }: RecentProjectsTableProps) {
  const columns: ColumnDef<RecentProject, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Tên dự án',
      cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'format',
      header: 'Định dạng',
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'target',
      header: 'Đích',
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ row }) => <Badge status={row.original.status} />,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
  ]

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Dự án gần đây</p>
        <button type="button" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Xem tất cả
        </button>
      </div>
      <DataTable
        data={projects}
        columns={columns}
        getRowId={(project) => project.id}
        loading={loading}
        emptyMessage="Chưa có dự án gần đây."
      />
    </div>
  )
}
