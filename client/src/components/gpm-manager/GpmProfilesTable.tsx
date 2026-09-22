import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { GpmGroup, GpmProfile } from '../../types/gpm';
import { cn } from '../../lib/cn';
import { Button, DataTable } from '../ui';

interface GpmProfilesTableProps {
  profiles: GpmProfile[];
  groups: GpmGroup[];
  selectedIds: Set<string>;
  runningProfileIds: Set<string>;
  actionBusyIds: Set<string>;
  loading?: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

function groupName(groups: GpmGroup[], groupId: string): string {
  return groups.find(group => group.id === groupId)?.name ?? (groupId || '—');
}

export function GpmProfilesTable({
  profiles,
  groups,
  selectedIds,
  runningProfileIds,
  actionBusyIds,
  loading,
  onToggleRow,
  onToggleAll,
  onStart,
  onStop,
}: GpmProfilesTableProps) {
  const { t } = useTranslation('browser');

  const columns: ColumnDef<GpmProfile, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('gpm.profiles.table.name'),
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      id: 'group',
      header: t('gpm.profiles.table.group'),
      cell: ({ row }) => (
        <span className="text-neutral-300">{groupName(groups, row.original.group_id)}</span>
      ),
    },
    {
      accessorKey: 'raw_proxy',
      header: t('gpm.profiles.table.proxy'),
      cell: ({ row }) => (
        <span
          className="max-w-48 truncate font-mono text-xs text-neutral-400"
          title={row.original.raw_proxy}
        >
          {row.original.raw_proxy || '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('gpm.profiles.table.actions'),
      cell: ({ row }) => {
        const profile = row.original;
        const running = runningProfileIds.has(profile.id);
        const busy = actionBusyIds.has(profile.id);
        return (
          <div onClick={e => e.stopPropagation()}>
            <Button
              variant={running ? 'danger' : 'outlined'}
              size="sm"
              className={cn(
                'rounded-lg',
                !running && 'border-success/30 text-success hover:border-success/50 hover:bg-success/10',
              )}
              disabled={busy}
              onClick={() => (running ? onStop(profile.id) : onStart(profile.id))}
            >
              {busy
                ? running
                  ? t('gpm.profiles.stopping')
                  : t('gpm.profiles.starting')
                : running
                  ? t('gpm.profiles.stop')
                  : t('gpm.profiles.start')}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      data={profiles}
      columns={columns}
      getRowId={profile => profile.id}
      loading={loading}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={profile => onToggleRow(profile.id)}
      emptyMessage={t('gpm.profiles.empty')}
    />
  );
}
