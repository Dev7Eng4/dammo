import { cn } from '../../lib/cn';
import type { ChromeProfile } from '../../types/chromeProfile';

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
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">ROLE</th>
              <th className="pb-3 pr-4 font-medium">NAME</th>
              <th className="pb-3 pr-4 font-medium">PROFILE ID</th>
              <th className="pb-3 pr-4 font-medium">USER DATA DIR</th>
              <th className="pb-3 font-medium">CREATED</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={5} className="py-3">
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
        <p className="text-sm text-neutral-400">No Chrome profiles yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">ROLE</th>
            <th className="pb-3 pr-4 font-medium">NAME</th>
            <th className="pb-3 pr-4 font-medium">PROFILE ID</th>
            <th className="pb-3 pr-4 font-medium">USER DATA DIR</th>
            <th className="pb-3 font-medium">CREATED</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr
              key={profile.id}
              onClick={() => onSelect(profile.id)}
              className={cn(
                'cursor-pointer border-b border-border/50 transition-colors last:border-0',
                selectedId === profile.id ? 'bg-primary-500/10' : 'hover:bg-surface-elevated/50',
              )}
            >
              <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.role === 'main'}
                    disabled={settingRole}
                    onChange={(e) => onRoleChange(profile.id, e.target.checked ? 'main' : 'sub')}
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
              </td>
              <td className="py-3 pr-4 font-medium text-neutral-100">{profile.name}</td>
              <td className="max-w-[12rem] truncate py-3 pr-4 font-mono text-xs text-neutral-300" title={profile.id}>
                {profile.id}
              </td>
              <td
                className="max-w-[16rem] truncate py-3 pr-4 font-mono text-xs text-neutral-400"
                title={profile.userDataDir}
              >
                {profile.userDataDir}
              </td>
              <td className="py-3 text-neutral-300">{formatCreatedAt(profile.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
