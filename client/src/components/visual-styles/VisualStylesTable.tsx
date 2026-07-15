import { type ColumnDef } from '@tanstack/react-table';
import type { VisualStyle } from '../../types/visualStyle';
import { Button, DataTable } from '../ui';

interface VisualStylesTableProps {
  styles: VisualStyle[];
  loading?: boolean;
  onEdit: (style: VisualStyle) => void;
  onDelete: (style: VisualStyle) => void;
}

function truncateRule(rule: string, maxLength = 80): string {
  const normalized = rule.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function VisualStylesTable({
  styles,
  loading,
  onEdit,
  onDelete,
}: VisualStylesTableProps) {
  const columns: ColumnDef<VisualStyle, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'NAME',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'niche',
      header: 'NICHE',
      cell: ({ getValue }) => <span className="text-neutral-300">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'rule',
      header: 'RULE',
      cell: ({ row }) => (
        <span className="text-neutral-400" title={row.original.rule}>
          {truncateRule(row.original.rule)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(row.original)}>
            Edit
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
            onClick={() => onDelete(row.original)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={styles}
      columns={columns}
      getRowId={style => style.id}
      loading={loading}
      emptyMessage="Chưa có visual style nào."
      emptyDescription="Thêm style đầu tiên (anime, chibi, cinematic, ...) để bắt đầu."
    />
  );
}
