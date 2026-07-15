import { type ColumnDef } from '@tanstack/react-table';
import type { GpmGroup } from '../../types/gpm';
import { DataTable } from '../ui';

interface GpmGroupsTableProps {
  groups: GpmGroup[];
  loading?: boolean;
  readOnly?: boolean;
  deletingId?: string | null;
  onEdit?: (group: GpmGroup) => void;
  onDelete?: (group: GpmGroup) => void;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
}

export function GpmGroupsTable({
  groups,
  loading,
  readOnly = true,
  deletingId,
  onEdit,
  onDelete,
}: GpmGroupsTableProps) {
  const columns: ColumnDef<GpmGroup, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'NAME',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'sort_order',
      header: 'SORT ORDER',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{getValue<number | undefined>() ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'CREATED',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
  ];

  if (!readOnly) {
    columns.push({
      id: 'actions',
      header: 'ACTIONS',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-xs"
            onClick={() => onEdit?.(row.original)}
            disabled={deletingId === row.original.id}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-xs text-danger"
            onClick={() => onDelete?.(row.original)}
            disabled={deletingId === row.original.id}
          >
            {deletingId === row.original.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ),
    });
  }

  return (
    <DataTable
      data={groups}
      columns={columns}
      getRowId={group => group.id}
      loading={loading}
      emptyMessage="No GPM groups found."
    />
  );
}
