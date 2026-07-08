import { cn } from '../../lib/cn';
import { Button } from '../ui';
import type { GpmGroup, GpmProfile } from '../../types/gpm';

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
  return groups.find((group) => group.id === groupId)?.name ?? (groupId || '—');
}

const COL_SPAN = 4;

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
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">NAME</th>
              <th className="pb-3 pr-4 font-medium">GROUP</th>
              <th className="pb-3 pr-4 font-medium">PROXY</th>
              <th className="pb-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={COL_SPAN} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No GPM profiles found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">NAME</th>
            <th className="pb-3 pr-4 font-medium">GROUP</th>
            <th className="pb-3 pr-4 font-medium">PROXY</th>
            <th className="pb-3 font-medium">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const running = runningProfileIds.has(profile.id);
            const busy = actionBusyIds.has(profile.id);

            return (
              <tr
                key={profile.id}
                onClick={() => onSelect(profile.id)}
                className={cn(
                  'cursor-pointer border-b border-border/50 transition-colors last:border-0',
                  selectedId === profile.id ? 'bg-primary-500/10' : 'hover:bg-surface-elevated/50',
                )}
              >
                <td className="py-3 pr-4 font-medium text-neutral-100">{profile.name}</td>
                <td className="py-3 pr-4 text-neutral-300">{groupName(groups, profile.group_id)}</td>
                <td
                  className="max-w-48 truncate py-3 pr-4 font-mono text-xs text-neutral-400"
                  title={profile.raw_proxy}
                >
                  {profile.raw_proxy || '—'}
                </td>
                <td className="py-3" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outlined"
                    size="sm"
                    className="rounded-lg"
                    disabled={busy}
                    onClick={() => (running ? onStop(profile.id) : onStart(profile.id))}
                  >
                    {busy ? (running ? 'Stopping…' : 'Starting…') : running ? 'Stop' : 'Start'}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
