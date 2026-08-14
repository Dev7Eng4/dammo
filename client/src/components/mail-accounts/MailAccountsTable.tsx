import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../ui';
import { PlatformLinkCell } from './PlatformLinkCell';
import type { MailAccount } from '../../types/mailAccount';

interface MailAccountsTableProps {
  accounts: MailAccount[];
  selectedId: string | null;
  selectedIds: Set<string>;
  loading?: boolean;
  rowNumberStart?: number;
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
    accessorKey: 'password',
    header: 'MẬT KHẨU',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-neutral-300">{getValue<string | undefined>() || '—'}</span>
    ),
  },
  {
    accessorKey: 'twoFactorAuth',
    header: '2FA',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-neutral-300">{getValue<string | undefined>() || '—'}</span>
    ),
  },
  {
    accessorKey: 'recoveryEmail',
    header: 'EMAIL KHÔI PHỤC',
    cell: ({ getValue }) => (
      <span className="text-neutral-300">{getValue<string>() || '—'}</span>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'SỐ ĐIỆN THOẠI',
    cell: ({ getValue }) => (
      <span className="text-neutral-300">{getValue<string | undefined>() || '—'}</span>
    ),
  },
  {
    id: 'youtube',
    header: 'YOUTUBE',
    cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.youtube} />,
  },
  {
    id: 'tiktok',
    header: 'TIKTOK',
    cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.tiktok} />,
  },
  {
    id: 'facebook',
    header: 'FACEBOOK',
    cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.facebook} />,
  },
];

export function MailAccountsTable({
  accounts,
  selectedId,
  selectedIds,
  loading,
  rowNumberStart,
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
      rowNumberStart={rowNumberStart}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      activeRowId={selectedId}
      onRowClick={account => onToggleRow(account.id)}
      emptyMessage="Không tìm thấy tài khoản email."
    />
  );
}
