import type { GpmGroup } from '../../types/gpm';

interface GpmGroupsTableProps {
  groups: GpmGroup[];
  loading?: boolean;
  readOnly?: boolean;
  deletingId?: string | null;
  onEdit?: (group: GpmGroup) => void;
  onDelete?: (group: GpmGroup) => void;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
}

export function GpmGroupsTable({
  groups,
  loading,
  readOnly = true,
  deletingId,
  onEdit,
  onDelete,
}: GpmGroupsTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">NAME</th>
              <th className="pb-3 pr-4 font-medium">SORT ORDER</th>
              <th className="pb-3 pr-4 font-medium">CREATED</th>
              {!readOnly ? <th className="pb-3 font-medium">ACTIONS</th> : null}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={readOnly ? 3 : 4} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No GPM groups found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">NAME</th>
            <th className="pb-3 pr-4 font-medium">SORT ORDER</th>
            <th className="pb-3 pr-4 font-medium">CREATED</th>
            {!readOnly ? <th className="pb-3 font-medium">ACTIONS</th> : null}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} className="border-b border-border/50 last:border-0">
              <td className="py-3 pr-4 font-medium text-neutral-100">{group.name}</td>
              <td className="py-3 pr-4 text-neutral-300">{group.sort_order ?? '—'}</td>
              <td className="py-3 pr-4 text-neutral-300">{formatDate(group.created_at)}</td>
              {!readOnly ? (
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-xs"
                      onClick={() => onEdit?.(group)}
                      disabled={deletingId === group.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-xs text-danger"
                      onClick={() => onDelete?.(group)}
                      disabled={deletingId === group.id}
                    >
                      {deletingId === group.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
