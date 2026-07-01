import { cn } from '../../lib/cn';
import { PlatformLinkCell } from './PlatformLinkCell';
import type { MailAccount } from '../../types/mailAccount';

interface MailAccountsTableProps {
  accounts: MailAccount[];
  selectedId: string | null;
  selectedIds: Set<string>;
  loading?: boolean;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

export function MailAccountsTable({
  accounts,
  selectedId,
  selectedIds,
  loading,
  onSelect,
  onToggleRow,
  onToggleAll,
}: MailAccountsTableProps) {
  const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 w-8" />
              <th className="pb-3 pr-4 font-medium">EMAIL</th>
              <th className="pb-3 pr-4 font-medium">YOUTUBE</th>
              <th className="pb-3 pr-4 font-medium">TIKTOK</th>
              <th className="pb-3 pr-4 font-medium">FACEBOOK</th>
              <th className="pb-3 font-medium">PURPOSE</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={6} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No mail accounts found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="size-3.5 rounded border-border bg-surface accent-primary-500"
              />
            </th>
            <th className="pb-3 pr-4 font-medium">EMAIL</th>
            <th className="pb-3 pr-4 font-medium">YOUTUBE</th>
            <th className="pb-3 pr-4 font-medium">TIKTOK</th>
            <th className="pb-3 pr-4 font-medium">FACEBOOK</th>
            <th className="pb-3 font-medium">PURPOSE</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              key={account.id}
              onClick={() => onSelect(account.id)}
              className={cn(
                'border-b border-border/50 cursor-pointer transition-colors',
                selectedId === account.id
                  ? 'bg-primary-500/10'
                  : 'hover:bg-surface-elevated/50',
              )}
            >
              <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(account.id)}
                  onChange={() => onToggleRow(account.id)}
                  className="size-3.5 rounded border-border bg-surface accent-primary-500"
                />
              </td>
              <td className="py-3 pr-4 font-medium text-neutral-100">{account.email}</td>
              <td className="py-3 pr-4">
                <PlatformLinkCell linked={account.platformLinks.youtube} />
              </td>
              <td className="py-3 pr-4">
                <PlatformLinkCell linked={account.platformLinks.tiktok} />
              </td>
              <td className="py-3 pr-4">
                <PlatformLinkCell linked={account.platformLinks.facebook} />
              </td>
              <td className="py-3 text-neutral-300">{account.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
