import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('mail');

  const columns: ColumnDef<MailAccount, unknown>[] = [
    {
      accessorKey: 'email',
      header: t('table.col.email'),
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'password',
      header: t('table.col.password'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-neutral-300">{getValue<string | undefined>() || '—'}</span>
      ),
    },
    {
      accessorKey: 'twoFactorAuth',
      header: t('table.col.twoFa'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-neutral-300">{getValue<string | undefined>() || '—'}</span>
      ),
    },
    {
      accessorKey: 'recoveryEmail',
      header: t('table.col.recovery'),
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{getValue<string>() || '—'}</span>
      ),
    },
    {
      accessorKey: 'phone',
      header: t('table.col.phone'),
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{getValue<string | undefined>() || '—'}</span>
      ),
    },
    {
      id: 'youtube',
      header: t('table.col.youtube'),
      cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.youtube} />,
    },
    {
      id: 'tiktok',
      header: t('table.col.tiktok'),
      cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.tiktok} />,
    },
    {
      id: 'facebook',
      header: t('table.col.facebook'),
      cell: ({ row }) => <PlatformLinkCell status={row.original.platformLinks.facebook} />,
    },
  ];

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
      emptyMessage={t('table.empty')}
    />
  );
}
