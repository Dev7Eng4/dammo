import { type ColumnDef } from '@tanstack/react-table';
import type { Proxy } from '../../types/proxy';
import { Button, DataTable } from '../ui';
import { ProxyStatusPill } from './ProxyStatusPill';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 5;

interface ProxiesTableProps {
  proxies: Proxy[];
  selectedIds: Set<string>;
  loading?: boolean;
  rowNumberStart?: number;
  pingingIds: Set<string>;
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function isExpirySoon(expiresAt?: string, nowMs = Date.now()): boolean {
  const end = expiresAt ? new Date(`${expiresAt}T23:59:59.999`).getTime() : NaN;
  if (Number.isNaN(end)) return false;
  return end <= nowMs + EXPIRY_WARNING_DAYS * DAY_MS;
}

export function ProxiesTable({
  proxies,
  selectedIds,
  loading,
  rowNumberStart,
  pingingIds,
  onToggleRow,
  onToggleAll,
  onPing,
  onExtend,
}: ProxiesTableProps) {
  const columns: ColumnDef<Proxy, unknown>[] = [
    {
      accessorKey: 'type',
      header: 'LOẠI',
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
      header: 'QUỐC GIA',
      cell: ({ row }) => (
        <span className="text-lg" title={row.original.countryCode}>
          {countryFlag(row.original.countryCode)}
        </span>
      ),
    },
    {
      accessorKey: 'provider',
      header: 'NHÀ CUNG CẤP',
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{getValue<string | undefined>() ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: 'HẾT HẠN',
      cell: ({ getValue }) => {
        const raw = getValue<string | undefined>();
        const soon = isExpirySoon(raw);
        return (
          <span className={soon ? 'text-danger' : 'text-neutral-400'}>{formatDate(raw)}</span>
        );
      },
    },
    {
      id: 'profiles',
      header: 'PROFILE',
      cell: ({ row }) => (
        <span className="text-neutral-300">{row.original.assignedProfileIds.length}</span>
      ),
    },
    {
      accessorKey: 'lastUsed',
      header: 'DÙNG GẦN NHẤT',
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'TRẠNG THÁI',
      cell: ({ row }) => <ProxyStatusPill status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'HÀNH ĐỘNG',
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
              {pingingIds.has(proxy.id) ? 'Đang ping…' : 'Ping'}
            </Button>
            <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onExtend(proxy.id)}>
              Gia hạn
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
      rowNumberStart={rowNumberStart}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={proxy => onToggleRow(proxy.id)}
      emptyMessage="Không có proxy khớp bộ lọc."
      emptyDescription="Thêm proxy hoặc nhập từ Excel để bắt đầu."
    />
  );
}
