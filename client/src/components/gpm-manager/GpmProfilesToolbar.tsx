import { Input, Button } from '../ui'
import { ListToolbar } from '../layout'
import type { GpmProfileSort } from '../../types/gpm'

interface GpmProfilesToolbarProps {
  count: number
  search: string
  sort: GpmProfileSort
  loading?: boolean
  starting?: boolean
  stopping?: boolean
  testing?: boolean
  deleting?: boolean
  canStart?: boolean
  canStop?: boolean
  canTest?: boolean
  canEdit?: boolean
  canDelete?: boolean
  onSearchChange: (value: string) => void
  onSortChange: (value: GpmProfileSort) => void
  onRefresh: () => void
  onAddProfile: () => void
  onStart: () => void
  onStop: () => void
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
}

export function GpmProfilesToolbar({
  count,
  search,
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
  onRefresh,
  onAddProfile,
  onStart,
  onStop,
  onTest,
  onEdit,
  onDelete,
}: GpmProfilesToolbarProps) {
  const busy = loading || starting || stopping || testing || deleting

  return (
    <ListToolbar
      countLabel={<span>{count.toLocaleString()} profile</span>}
      filters={
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm profile…"
          className="h-9 w-48 text-sm"
          disabled={busy}
        />
      }
      extraActions={
        <>
          <Button variant="outlined" size="sm" onClick={onRefresh} disabled={busy}>
            Làm mới
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="border-success/30 text-success hover:border-success/50 hover:bg-success/10"
            onClick={onStart}
            disabled={!canStart || starting || busy}
          >
            {starting ? 'Đang khởi động…' : 'Khởi động'}
          </Button>
          <Button variant="danger" size="sm" onClick={onStop} disabled={!canStop || stopping || busy}>
            {stopping ? 'Đang dừng…' : 'Dừng'}
          </Button>
          <Button variant="outlined" size="sm" onClick={onTest} disabled={!canTest || testing || busy}>
            {testing ? 'Đang kiểm tra…' : 'Kiểm tra'}
          </Button>
          <Button variant="outlined" size="sm" onClick={onEdit} disabled={!canEdit || busy}>
            Sửa
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={onDelete}
            disabled={!canDelete || deleting || busy}
          >
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </>
      }
      primaryAction={{ label: 'Thêm Profile', onClick: onAddProfile, disabled: busy }}
    />
  )
}
