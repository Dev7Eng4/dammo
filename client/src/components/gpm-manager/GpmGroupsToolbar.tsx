import { Button, Input } from '../ui';

interface GpmGroupsToolbarProps {
  count: number;
  search: string;
  loading?: boolean;
  readOnly?: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onAddGroup?: () => void;
}

export function GpmGroupsToolbar({
  count,
  search,
  loading,
  readOnly,
  onSearchChange,
  onRefresh,
  onAddGroup,
}: GpmGroupsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-400">{count.toLocaleString()} Nhóm</span>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm nhóm…"
          className="h-9 w-48 rounded-lg text-sm"
          disabled={loading}
        />
        {readOnly ? (
          <span className="text-xs text-neutral-500">Chỉ xem (GPM API v3)</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onRefresh} disabled={loading}>
          Làm mới
        </Button>
        {!readOnly && onAddGroup ? (
          <Button size="sm" className="rounded-lg" onClick={onAddGroup} disabled={loading}>
            Tạo
          </Button>
        ) : null}
      </div>
    </div>
  );
}
