import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import type { ChromeProfile } from '../../types/chromeProfile';
import { DataTable } from '../ui';

interface ChromeProfilesTableProps {
  profiles: ChromeProfile[];
  selectedId: string | null;
  loading?: boolean;
  settingRole?: boolean;
  onSelect: (id: string) => void;
  onRoleChange: (id: string, role: ChromeProfile['role']) => void;
}

export function ChromeProfilesTable({
  profiles,
  selectedId,
  loading,
  settingRole,
  onSelect,
  onRoleChange,
}: ChromeProfilesTableProps) {
  const { t, i18n } = useTranslation('browser');
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  function formatCreatedAt(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(dateLocale);
  }

  const columns: ColumnDef<ChromeProfile, unknown>[] = [
    {
      id: 'role',
      header: t('chrome.table.col.role'),
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <label
            className="inline-flex cursor-pointer items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={profile.role === 'main'}
              disabled={settingRole}
              onChange={e => onRoleChange(profile.id, e.target.checked ? 'main' : 'sub')}
              className="size-3.5 rounded border-border bg-surface accent-primary-500"
            />
            <span
              className={cn(
                'text-xs font-medium',
                profile.role === 'main' ? 'text-primary-400' : 'text-neutral-500',
              )}
            >
              {profile.role === 'main' ? t('chrome.table.roleMain') : t('chrome.table.roleSecondary')}
            </span>
          </label>
        );
      },
    },
    {
      accessorKey: 'name',
      header: t('chrome.table.col.name'),
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      id: 'usageOrder',
      header: t('chrome.table.col.order'),
      cell: ({ row }) => {
        const order = row.original.usageOrder;
        return (
          <span className="font-mono text-xs text-neutral-300">
            {typeof order === 'number' ? order : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'id',
      header: t('chrome.table.col.profileId'),
      cell: ({ getValue }) => {
        const id = getValue<string>();
        return (
          <span className="max-w-[12rem] truncate font-mono text-xs text-neutral-300" title={id}>
            {id}
          </span>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('chrome.table.col.createdAt'),
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatCreatedAt(getValue<string>())}</span>
      ),
    },
  ];

  return (
    <DataTable
      data={profiles}
      columns={columns}
      getRowId={profile => profile.id}
      loading={loading}
      activeRowId={selectedId}
      onRowClick={profile => onSelect(profile.id)}
      emptyMessage={t('chrome.table.empty')}
    />
  );
}
