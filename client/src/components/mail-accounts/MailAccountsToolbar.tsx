import { SearchInput } from '../ui'
import { ListToolbar } from '../layout'
import { Button } from '../ui'

interface MailAccountsToolbarProps {
  total: number
  search?: string
  canEdit?: boolean
  editDisabledReason?: string
  canDelete?: boolean
  deleteDisabledReason?: string
  deleting?: boolean
  onSearchChange?: (value: string) => void
  onAddMail: () => void
  onEdit?: () => void
  onDelete?: () => void
  onExportExcel: () => void
  exporting?: boolean
}

export function MailAccountsToolbar({
  total,
  search = '',
  canEdit = false,
  editDisabledReason,
  canDelete = false,
  deleteDisabledReason,
  deleting = false,
  onSearchChange,
  onAddMail,
  onEdit,
  onDelete,
  onExportExcel,
  exporting = false,
}: MailAccountsToolbarProps) {
  return (
    <div className="border-b border-border pb-4">
      <ListToolbar
        countLabel={<span>{total.toLocaleString()} tài khoản</span>}
        filters={
          onSearchChange ? (
            <div className="w-48 lg:w-56">
              <SearchInput
                value={search}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                placeholder="Tìm theo email..."
                className="h-9"
              />
            </div>
          ) : null
        }
        extraActions={
          <>
            {onEdit ? (
              <Button
                variant="outlined"
                size="sm"
                disabled={!canEdit}
                title={!canEdit ? editDisabledReason : undefined}
                onClick={onEdit}
              >
                Sửa
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="danger"
                size="sm"
                disabled={deleting || !canDelete}
                title={!deleting && !canDelete ? deleteDisabledReason : undefined}
                onClick={onDelete}
              >
                {deleting ? 'Đang xóa…' : 'Xóa'}
              </Button>
            ) : null}
          </>
        }
        primaryAction={{ label: 'Thêm email', onClick: onAddMail }}
        secondaryActions={[
          {
            id: 'export',
            label: exporting ? 'Đang xuất...' : 'Xuất Excel',
            onSelect: onExportExcel,
            disabled: exporting,
          },
        ]}
      />
    </div>
  )
}
