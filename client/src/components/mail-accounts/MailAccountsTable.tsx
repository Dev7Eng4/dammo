import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../ui';
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

const columns: ColumnDef<MailAccount, unknown>[] = [
  {
    accessorKey: 'email',
    header: 'EMAIL',
    cell: ({ getValue }) => (
      <span className="font-medium text-neutral-100">{getValue<string>()}</span>
    ),
  },
  {
    id: 'youtube',
    header: 'YOUTUBE',
    cell: ({ row }) => <PlatformLinkCell linked={row.original.platformLinks.youtube} />,
  },
  {
    id: 'tiktok',
    header: 'TIKTOK',
    cell: ({ row }) => <PlatformLinkCell linked={row.original.platformLinks.tiktok} />,
  },
  {
    id: 'facebook',
    header: 'FACEBOOK',
    cell: ({ row }) => <PlatformLinkCell linked={row.original.platformLinks.facebook} />,
  },
  {
    accessorKey: 'purpose',
    header: 'PURPOSE',
    cell: ({ getValue }) => <span className="text-neutral-300">{getValue<string>()}</span>,
  },
];

export function MailAccountsTable({
  accounts,
  selectedId,
  selectedIds,
  loading,
  onSelect: _onSelect,
  onToggleRow,
  onToggleAll,
}: MailAccountsTableProps) {
  return (
    <DataTable
      data={accounts}
      columns={columns}
      getRowId={account => account.id}
      loading={loading}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      activeRowId={selectedId}
      onRowClick={account => onToggleRow(account.id)}
      emptyMessage="No mail accounts found."
    />
  );
}
