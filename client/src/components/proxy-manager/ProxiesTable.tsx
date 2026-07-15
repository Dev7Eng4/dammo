import { type ColumnDef } from '@tanstack/react-table';
import type { Proxy } from '../../types/proxy';
import { Button, DataTable } from '../ui';
import { ProxyStatusPill } from './ProxyStatusPill';

interface ProxiesTableProps {
  proxies: Proxy[];
  selectedId: string | null;
  selectedIds: Set<string>;
  loading?: boolean;
  pingingIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onPing: (id: string) => void;
  onExtend: (id: string) => void;
}

function countryFlag(code?: string) {
  if (!code || code.length !== 2) return '—';
  const upper = code.toUpperCase();
  return String.fromCodePoint(...[...upper].map(char => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB');
}

export function ProxiesTable({
  proxies,
  selectedId,
  selectedIds,
  loading,
  pingingIds,
  onSelect,
  onToggleRow,
  onToggleAll,
  onPing,
  onExtend,
}: ProxiesTableProps) {
  const columns: ColumnDef<Proxy, unknown>[] = [
    {
      accessorKey: 'type',
      header: 'TYPE',
      cell: ({ getValue }) => (
        <span className="uppercase text-neutral-400">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'host',
      header: 'HOST',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-neutral-300">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'port',
      header: 'PORT',
      cell: ({ getValue }) => <span className="text-neutral-300">{getValue<number>()}</span>,
    },
    {
      id: 'country',
      header: 'COUNTRY',
      cell: ({ row }) => (
        <span className="text-lg" title={row.original.countryCode}>
          {countryFlag(row.original.countryCode)}
        </span>
      ),
    },
    {
      accessorKey: 'provider',
      header: 'PROVIDER',
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{getValue<string | undefined>() ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: 'EXPIRES',
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      id: 'profiles',
      header: 'PROFILES',
      cell: ({ row }) => (
        <span className="text-neutral-300">{row.original.assignedProfileIds.length}</span>
      ),
    },
    {
      accessorKey: 'lastUsed',
      header: 'LAST USED',
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => <ProxyStatusPill status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      cell: ({ row }) => {
        const proxy = row.original;
        return (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              disabled={pingingIds.has(proxy.id)}
              onClick={() => onPing(proxy.id)}
            >
              {pingingIds.has(proxy.id) ? 'Pinging…' : 'Ping'}
            </Button>
            <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onExtend(proxy.id)}>
              Extend
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      data={proxies}
      columns={columns}
      getRowId={proxy => proxy.id}
      loading={loading}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      activeRowId={selectedId}
      onRowClick={proxy => onSelect(proxy.id)}
      emptyMessage="No proxies match your filter."
      emptyDescription="Add a proxy or import from Excel to get started."
    />
  );
}
