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
      header: 'TÊN',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'niche',
      header: 'CHỦ ĐỀ',
      cell: ({ getValue }) => <span className="text-neutral-300">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'rule',
      header: 'QUY TẮC',
      cell: ({ row }) => (
        <span className="text-neutral-400" title={row.original.rule}>
          {truncateRule(row.original.rule)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'THAO TÁC',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(row.original)}>
            Sửa
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
            onClick={() => onDelete(row.original)}
          >
            Xóa
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
      emptyMessage="Chưa có phong cách hình ảnh nào."
      emptyDescription="Thêm phong cách đầu tiên (anime, chibi, cinematic, ...) để bắt đầu."
    />
  );
}
