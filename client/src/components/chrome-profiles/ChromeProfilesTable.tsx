import { type ColumnDef } from '@tanstack/react-table';
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

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
}

export function ChromeProfilesTable({
  profiles,
  selectedId,
  loading,
  settingRole,
  onSelect,
  onRoleChange,
}: ChromeProfilesTableProps) {
  const columns: ColumnDef<ChromeProfile, unknown>[] = [
    {
      id: 'role',
      header: 'ROLE',
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
              {profile.role === 'main' ? 'Main' : 'Sub'}
            </span>
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
      accessorKey: 'id',
      header: 'PROFILE ID',
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
      header: 'CREATED',
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
      emptyMessage="No Chrome profiles yet. Add one to get started."
    />
  );
}
