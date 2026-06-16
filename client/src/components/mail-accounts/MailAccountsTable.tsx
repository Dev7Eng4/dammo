import { cn } from '../../lib/cn';
import { StatusPill } from '../ui/StatusPill';
import { PlatformIcon } from './PlatformIcon';
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

function truncateRecovery(email: string, max = 16) {
  if (email === 'None' || !email) return 'None';
  if (email.length <= max) return email;
  return email.slice(0, max) + '...';
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
              <th className="pb-3 pr-4 font-medium">EMAIL ADDRESS</th>
              <th className="pb-3 pr-4 font-medium">PROVIDER</th>
              <th className="pb-3 pr-4 font-medium">STATUS</th>
              <th className="pb-3 pr-4 font-medium">PURPOSE</th>
              <th className="pb-3 pr-4 font-medium">LINKED PLATFORMS</th>
              <th className="pb-3 font-medium">RECOVERY</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={7} className="py-3">
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
        <p className="text-sm text-neutral-400">No mail accounts match your filter.</p>
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
            <th className="pb-3 pr-4 font-medium">EMAIL ADDRESS</th>
            <th className="pb-3 pr-4 font-medium">PROVIDER</th>
            <th className="pb-3 pr-4 font-medium">STATUS</th>
            <th className="pb-3 pr-4 font-medium">PURPOSE</th>
            <th className="pb-3 pr-4 font-medium">LINKED PLATFORMS</th>
            <th className="pb-3 font-medium">RECOVERY</th>
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
              <td className="py-3 pr-4 text-neutral-400">{account.provider}</td>
              <td className="py-3 pr-4">
                <StatusPill status={account.status} />
              </td>
              <td className="py-3 pr-4 text-neutral-300">{account.purpose}</td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-1.5">
                  {account.linkedPlatforms.map((p) => (
                    <PlatformIcon key={p} platform={p} className="text-neutral-400" />
                  ))}
                </div>
              </td>
              <td className="py-3 text-neutral-500 font-mono text-xs">
                {truncateRecovery(account.recoveryEmail)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
