import { type ColumnDef } from '@tanstack/react-table';
import type { GpmGroup, GpmProfile } from '../../types/gpm';
import { cn } from '../../lib/cn';
import { Button, DataTable } from '../ui';

export type GpmCapabilityKey = 'flowEnabled' | 'metaEnabled';

interface GpmProfilesTableProps {
  profiles: GpmProfile[];
  groups: GpmGroup[];
  selectedId: string | null;
  runningProfileIds: Set<string>;
  actionBusyIds: Set<string>;
  updatingCapabilityIds?: Set<string>;
  loading?: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onCapabilityChange: (id: string, key: GpmCapabilityKey, value: boolean) => void;
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
  updatingCapabilityIds,
  loading,
  onSelect,
  onStart,
  onStop,
  onCapabilityChange,
}: GpmProfilesTableProps) {
  const columns: ColumnDef<GpmProfile, unknown>[] = [
    {
      id: 'flow',
      header: 'FLOW',
      cell: ({ row }) => {
        const profile = row.original;
        const updating = updatingCapabilityIds?.has(profile.id) ?? false;
        return (
          <label
            className="inline-flex cursor-pointer items-center"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={profile.flowEnabled === true}
              disabled={updating}
              onChange={e => onCapabilityChange(profile.id, 'flowEnabled', e.target.checked)}
              className="size-3.5 rounded border-border bg-surface accent-primary-500"
              aria-label={`Flow enabled for ${profile.name}`}
            />
          </label>
        );
      },
    },
    {
      id: 'meta',
      header: 'META',
      cell: ({ row }) => {
        const profile = row.original;
        const updating = updatingCapabilityIds?.has(profile.id) ?? false;
        return (
          <label
            className="inline-flex cursor-pointer items-center"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={profile.metaEnabled === true}
              disabled={updating}
              onChange={e => onCapabilityChange(profile.id, 'metaEnabled', e.target.checked)}
              className="size-3.5 rounded border-border bg-surface accent-primary-500"
              aria-label={`Meta enabled for ${profile.name}`}
            />
          </label>
        );
      },
    },
    {
      accessorKey: 'name',
      header: 'NAME',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      id: 'group',
      header: 'GROUP',
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
      header: 'ACTIONS',
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
              {busy ? (running ? 'Stopping…' : 'Starting…') : running ? 'Stop' : 'Start'}
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
      emptyMessage="No GPM profiles found."
    />
  );
}
