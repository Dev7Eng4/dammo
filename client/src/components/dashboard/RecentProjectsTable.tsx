import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { RecentProject } from '../../types/dashboard'
import { Badge, DataTable } from '../ui'

interface RecentProjectsTableProps {
  projects: RecentProject[]
  loading?: boolean
}

export function RecentProjectsTable({ projects, loading }: RecentProjectsTableProps) {
  const { t } = useTranslation('dashboard')

  const columns: ColumnDef<RecentProject, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('recent.col.name'),
      cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'format',
      header: t('recent.col.format'),
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'target',
      header: t('recent.col.destination'),
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
    {
      accessorKey: 'status',
      header: t('recent.col.status'),
      cell: ({ row }) => <Badge status={row.original.status} />,
      meta: { cellClassName: 'py-2.5', headerClassName: 'pb-2' },
    },
  ]

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{t('recent.title')}</p>
        <button type="button" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          {t('recent.viewAll')}
        </button>
      </div>
      <DataTable
        data={projects}
        columns={columns}
        getRowId={(project) => project.id}
        loading={loading}
        emptyMessage={t('recent.empty')}
      />
    </div>
  )
}
