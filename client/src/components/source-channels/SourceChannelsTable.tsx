import { type ColumnDef } from '@tanstack/react-table';
import type { Niche } from '../../types/niche';
import type { SourceChannel } from '../../types/sourceChannel';
import { resolveNicheLabel } from '../../utils/niche';
import { PlatformIcon } from '../mail-accounts/PlatformIcon';
import { DataTable, Link } from '../ui';
import { PurposePill } from './PurposePill';

interface SourceChannelsTableProps {
  sources: SourceChannel[];
  niches?: Niche[];
  loading?: boolean;
  selectedIds: Set<string>;
  bumpingRiskId?: string | null;
  savingNotesId?: string | null;
  deletingId?: string | null;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onBumpRisk?: (id: string) => void;
  onNotesChange?: (id: string, notes: string) => void;
  onDelete?: (id: string) => void;
}

function truncateUrl(url: string, max = 14) {
  if (url.length <= max) return url;
  return url.slice(0, max) + '...';
}

export function SourceChannelsTable({
  sources,
  niches = [],
  loading,
  selectedIds,
  bumpingRiskId: _bumpingRiskId,
  savingNotesId,
  deletingId: _deletingId,
  onSelect,
  onToggleRow,
  onToggleAll,
  onBumpRisk: _onBumpRisk,
  onNotesChange,
  onDelete: _onDelete,
}: SourceChannelsTableProps) {
  const columns: ColumnDef<SourceChannel, unknown>[] = [
    {
      id: 'platform',
      header: 'PLAT',
      meta: { headerClassName: 'w-12' },
      cell: ({ row }) => <PlatformIcon platform={row.original.platform} className="text-neutral-400" />,
    },
    {
      accessorKey: 'name',
      header: 'SOURCE NAME',
      cell: ({ row }) => (
        <span
          className="font-medium text-green-600"
          onClick={e => {
            e.stopPropagation();
            onSelect(row.original.id);
          }}
        >
          <Link to={`/source-channels/${row.original.id}`}>{row.original.name}</Link>
        </span>
      ),
    },
    {
      accessorKey: 'url',
      header: 'URL (ID)',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-neutral-500">{truncateUrl(getValue<string>())}</span>
      ),
    },
    {
      accessorKey: 'niche',
      header: 'NICHE',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{resolveNicheLabel(getValue<string>(), niches)}</span>
      ),
    },
    {
      accessorKey: 'purpose',
      header: 'PURPOSE',
      cell: ({ row }) => <PurposePill purpose={row.original.purpose} />,
    },
    {
      id: 'notes',
      header: 'NOTES',
      cell: ({ row }) => {
        const source = row.original;
        const isSavingNotes = savingNotesId === source.id;
        return (
          <div className="min-w-[12rem]" onClick={e => e.stopPropagation()}>
            {onNotesChange ? (
              <input
                key={`${source.id}-${source.notes ?? ''}`}
                type="text"
                defaultValue={source.notes ?? ''}
                placeholder="Add note..."
                disabled={isSavingNotes}
                onBlur={e => onNotesChange(source.id, e.currentTarget.value)}
                className="h-8 w-full min-w-[10rem] rounded-lg border border-border bg-surface-elevated px-2.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 disabled:opacity-60"
              />
            ) : (
              <span className="text-xs text-neutral-400">{source.notes || '—'}</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      data={sources}
      columns={columns}
      getRowId={source => source.id}
      loading={loading}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={source => onToggleRow(source.id)}
      emptyMessage="No source channels match your filter."
    />
  );
}
