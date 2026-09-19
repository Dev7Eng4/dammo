import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { ProxyProvider } from '../../types/proxy';
import { Button, DataTable } from '../ui';

interface ProxyProvidersTableProps {
  providers: ProxyProvider[];
  loading?: boolean;
  onEdit: (provider: ProxyProvider) => void;
  onDelete: (provider: ProxyProvider) => void;
}

function MaskedPassword({ value }: { value: string }) {
  const { t } = useTranslation('browser');
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-neutral-300">{visible ? value : '••••••••'}</span>
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="text-neutral-500 hover:text-neutral-300"
        title={visible ? t('proxy.providers.hidePassword') : t('proxy.providers.showPassword')}
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

export function ProxyProvidersTable({
  providers,
  loading,
  onEdit,
  onDelete,
}: ProxyProvidersTableProps) {
  const { t } = useTranslation(['browser', 'common']);

  const columns: ColumnDef<ProxyProvider, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('proxy.providers.table.name'),
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'loginUrl',
      header: t('proxy.providers.table.loginUrl'),
      cell: ({ row }) =>
        row.original.loginUrl ? (
          <a
            href={row.original.loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:underline"
          >
            {row.original.loginUrl}
          </a>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
    {
      accessorKey: 'username',
      header: t('proxy.providers.table.username'),
      cell: ({ getValue }) => <span className="text-neutral-300">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'password',
      header: t('proxy.providers.table.password'),
      cell: ({ row }) => <MaskedPassword value={row.original.password} />,
    },
    {
      id: 'actions',
      header: t('proxy.providers.table.actions'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(row.original)}>
            {t('common:actions.edit')}
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
            onClick={() => onDelete(row.original)}
          >
            {t('common:actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={providers}
      columns={columns}
      getRowId={provider => provider.id}
      loading={loading}
      emptyMessage={t('proxy.providers.empty')}
      emptyDescription={t('proxy.providers.emptyDesc')}
    />
  );
}
