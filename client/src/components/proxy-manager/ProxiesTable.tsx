import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('browser');
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  function formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(dateLocale);
  }

  const columns: ColumnDef<Proxy, unknown>[] = [
    {
      accessorKey: 'type',
      header: t('proxy.table.col.type'),
      cell: ({ getValue }) => (
        <span className="uppercase text-neutral-400">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'host',
      header: t('proxy.table.col.host'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-neutral-300">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'port',
      header: t('proxy.table.col.port'),
      cell: ({ getValue }) => <span className="text-neutral-300">{getValue<number>()}</span>,
    },
    {
      id: 'country',
      header: t('proxy.table.col.country'),
      cell: ({ row }) => (
        <span className="text-lg" title={row.original.countryCode}>
          {countryFlag(row.original.countryCode)}
        </span>
      ),
    },
    {
      accessorKey: 'provider',
      header: t('proxy.table.col.provider'),
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{getValue<string | undefined>() ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: t('proxy.table.col.expires'),
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
      header: t('proxy.table.col.profiles'),
      cell: ({ row }) => (
        <span className="text-neutral-300">{row.original.assignedProfileIds.length}</span>
      ),
    },
    {
      accessorKey: 'lastUsed',
      header: t('proxy.table.col.lastUsed'),
      cell: ({ getValue }) => (
        <span className="text-neutral-400">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('proxy.table.col.status'),
      cell: ({ row }) => <ProxyStatusPill status={row.original.status} />,
    },
    {
      id: 'actions',
      header: t('proxy.table.col.actions'),
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
              {pingingIds.has(proxy.id) ? t('proxy.table.pinging') : t('proxy.table.ping')}
            </Button>
            <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onExtend(proxy.id)}>
              {t('proxy.table.renew')}
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
      emptyMessage={t('proxy.table.empty')}
      emptyDescription={t('proxy.table.emptyDesc')}
    />
  );
}
