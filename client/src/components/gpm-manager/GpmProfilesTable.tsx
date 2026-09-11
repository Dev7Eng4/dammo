import { type ColumnDef } from '@tanstack/react-table';
import type { GpmGroup, GpmProfile } from '../../types/gpm';
import { cn } from '../../lib/cn';
import { Button, DataTable } from '../ui';

interface GpmProfilesTableProps {
  profiles: GpmProfile[];
  groups: GpmGroup[];
  selectedId: string | null;
  runningProfileIds: Set<string>;
  actionBusyIds: Set<string>;
  loading?: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

function groupName(groups: GpmGroup[], groupId: string): string {
  return groups.find(group => group.id === groupId)?.name ?? (groupId || '—');
}

export function GpmProfilesTable({
  profiles,
  groups,
  selectedId,
  runningProfileIds,
  actionBusyIds,
  loading,
  onSelect,
  onStart,
  onStop,
}: GpmProfilesTableProps) {
  const columns: ColumnDef<GpmProfile, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'TÊN',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      id: 'group',
      header: 'NHÓM',
      cell: ({ row }) => (
        <span className="text-neutral-300">{groupName(groups, row.original.group_id)}</span>
      ),
    },
    {
      accessorKey: 'raw_proxy',
      header: 'PROXY',
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
      header: 'THAO TÁC',
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
              {busy ? (running ? 'Đang dừng…' : 'Đang khởi động…') : running ? 'Dừng' : 'Khởi động'}
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
      activeRowId={selectedId}
      onRowClick={profile => onSelect(profile.id)}
      emptyMessage="Không tìm thấy GPM profile."
    />
  );
}
