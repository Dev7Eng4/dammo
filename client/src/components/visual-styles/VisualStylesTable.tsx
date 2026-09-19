import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['content', 'common']);

  const columns = useMemo<ColumnDef<VisualStyle, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('visual.table.col.name'),
        cell: ({ getValue }) => (
          <span className="font-medium text-neutral-100">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'niche',
        header: t('visual.table.col.theme'),
        cell: ({ getValue }) => <span className="text-neutral-300">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'rule',
        header: t('visual.table.col.rules'),
        cell: ({ row }) => (
          <span className="text-neutral-400" title={row.original.rule}>
            {truncateRule(row.original.rule)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('visual.table.col.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(row.original)}>
              {t('visual.table.edit')}
            </Button>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
              onClick={() => onDelete(row.original)}
            >
              {t('visual.table.delete')}
            </Button>
          </div>
        ),
      },
    ],
    [t, onEdit, onDelete],
  );

  return (
    <DataTable
      data={styles}
      columns={columns}
      getRowId={(style) => style.id}
      loading={loading}
      emptyMessage={t('visual.table.empty')}
      emptyDescription={t('visual.table.emptyDesc')}
    />
  );
}
