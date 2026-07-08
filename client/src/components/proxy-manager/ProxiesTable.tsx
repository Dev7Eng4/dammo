import { cn } from '../../lib/cn';
import { Button } from '../ui';
import { ProxyStatusPill } from './ProxyStatusPill';
import type { Proxy } from '../../types/proxy';

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
  return String.fromCodePoint(...[...upper].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB');
}

const COL_SPAN = 10;

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
  const allSelected = proxies.length > 0 && selectedIds.size === proxies.length;

  const headers = (
    <tr className="border-b border-border text-xs text-neutral-500">
      <th className="w-8 pb-3 pr-4" />
      <th className="pb-3 pr-4 font-medium">TYPE</th>
      <th className="pb-3 pr-4 font-medium">HOST</th>
      <th className="pb-3 pr-4 font-medium">PORT</th>
      <th className="pb-3 pr-4 font-medium">USERNAME</th>
      <th className="pb-3 pr-4 font-medium">COUNTRY</th>
      <th className="pb-3 pr-4 font-medium">PROVIDER</th>
      <th className="pb-3 pr-4 font-medium">EXPIRES</th>
      <th className="pb-3 pr-4 font-medium">PROFILES</th>
      <th className="pb-3 pr-4 font-medium">STATUS</th>
      <th className="pb-3 font-medium">ACTIONS</th>
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>{headers}</thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={COL_SPAN + 1} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (proxies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No proxies match your filter.</p>
        <p className="mt-1 text-xs text-neutral-500">Add a proxy or import from Excel to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="w-8 pb-3 pr-4">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="size-3.5 rounded border-border bg-surface accent-primary-500"
              />
            </th>
            <th className="pb-3 pr-4 font-medium">TYPE</th>
            <th className="pb-3 pr-4 font-medium">HOST</th>
            <th className="pb-3 pr-4 font-medium">PORT</th>
            <th className="pb-3 pr-4 font-medium">USERNAME</th>
            <th className="pb-3 pr-4 font-medium">COUNTRY</th>
            <th className="pb-3 pr-4 font-medium">PROVIDER</th>
            <th className="pb-3 pr-4 font-medium">EXPIRES</th>
            <th className="pb-3 pr-4 font-medium">PROFILES</th>
            <th className="pb-3 pr-4 font-medium">STATUS</th>
            <th className="pb-3 font-medium">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {proxies.map((proxy) => (
            <tr
              key={proxy.id}
              onClick={() => onSelect(proxy.id)}
              className={cn(
                'cursor-pointer border-b border-border/50 transition-colors',
                selectedId === proxy.id ? 'bg-primary-500/10' : 'hover:bg-surface-elevated/50',
              )}
            >
              <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(proxy.id)}
                  onChange={() => onToggleRow(proxy.id)}
                  className="size-3.5 rounded border-border bg-surface accent-primary-500"
                />
              </td>
              <td className="py-3 pr-4 uppercase text-neutral-400">{proxy.type}</td>
              <td className="py-3 pr-4 font-mono text-xs text-neutral-300">{proxy.host}</td>
              <td className="py-3 pr-4 text-neutral-300">{proxy.port}</td>
              <td className="py-3 pr-4 font-mono text-xs text-neutral-400">{proxy.username ?? '—'}</td>
              <td className="py-3 pr-4 text-lg" title={proxy.countryCode}>
                {countryFlag(proxy.countryCode)}
              </td>
              <td className="py-3 pr-4 text-neutral-400">{proxy.provider ?? '—'}</td>
              <td className="py-3 pr-4 text-neutral-400">{formatDate(proxy.expiresAt)}</td>
              <td className="py-3 pr-4 text-neutral-300">{proxy.assignedProfileIds.length}</td>
              <td className="py-3 pr-4">
                <ProxyStatusPill status={proxy.status} />
              </td>
              <td className="py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outlined"
                    size="sm"
                    className="rounded-lg"
                    disabled={pingingIds.has(proxy.id)}
                    onClick={() => onPing(proxy.id)}
                  >
                    {pingingIds.has(proxy.id) ? 'Pinging…' : 'Ping'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => onExtend(proxy.id)}
                  >
                    Extend
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
