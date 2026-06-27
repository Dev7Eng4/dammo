import { Input, Select, Button } from '../ui';
import type { GpmProfileSort } from '../../types/gpm';

const SORT_OPTIONS = [
  { value: '0', label: 'Newest first' },
  { value: '1', label: 'Oldest first' },
  { value: '2', label: 'Name A–Z' },
  { value: '3', label: 'Name Z–A' },
];

interface GpmProfilesToolbarProps {
  count: number;
  search: string;
  sort: GpmProfileSort;
  loading?: boolean;
  starting?: boolean;
  stopping?: boolean;
  testing?: boolean;
  deleting?: boolean;
  canStart?: boolean;
  canStop?: boolean;
  canTest?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: GpmProfileSort) => void;
  onRefresh: () => void;
  onAddProfile: () => void;
  onStart: () => void;
  onStop: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GpmProfilesToolbar({
  count,
  search,
  sort,
  loading,
  starting,
  stopping,
  testing,
  deleting,
  canStart,
  canStop,
  canTest,
  canEdit,
  canDelete,
  onSearchChange,
  onSortChange,
  onRefresh,
  onAddProfile,
  onStart,
  onStop,
  onTest,
  onEdit,
  onDelete,
}: GpmProfilesToolbarProps) {
  const busy = loading || starting || stopping || testing || deleting;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-400">{count.toLocaleString()} Profiles</span>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search profiles…"
          className="h-9 w-48 rounded-lg text-sm"
          disabled={busy}
        />
        <Select
          value={String(sort)}
          onChange={(value) => onSortChange(Number(value) as GpmProfileSort)}
          options={SORT_OPTIONS}
          disabled={busy}
          triggerClassName="h-9 w-40 rounded-lg text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onRefresh} disabled={busy}>
          Refresh
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onStart}
          disabled={!canStart || starting || busy}
        >
          {starting ? 'Starting…' : 'Start'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onStop}
          disabled={!canStop || stopping || busy}
        >
          {stopping ? 'Stopping…' : 'Stop'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onTest}
          disabled={!canTest || testing || busy}
        >
          {testing ? 'Testing…' : 'Test'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onEdit}
          disabled={!canEdit || busy}
        >
          Edit
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg text-danger hover:text-danger"
          onClick={onDelete}
          disabled={!canDelete || deleting || busy}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
        <Button size="sm" className="rounded-lg" onClick={onAddProfile} disabled={busy}>
          Add Profile
        </Button>
      </div>
    </div>
  );
}
