import { useRef } from 'react'
import { ListToolbar } from '../layout'
import { DropdownSelect } from '../ui'
import type { ProxyFilter } from '../../types/proxy'
import { Filter } from 'lucide-react'

interface ProxiesToolbarProps {
  total: number
  filter: ProxyFilter
  onFilterChange: (filter: ProxyFilter) => void
  onAddProxy: () => void
  onImportExcel: (file: File) => void
  onExportExcel: () => void
  onDeleteSelected: () => void
  onRemoveFailed: () => void
  canDeleteSelected?: boolean
  deletingSelected?: boolean
  exporting?: boolean
  importing?: boolean
  removingFailed?: boolean
}

const filterOptions: { value: ProxyFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'slow', label: 'Chậm' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'in_use', label: 'Đang dùng' },
]

export function ProxiesToolbar({
  total,
  filter,
  onFilterChange,
  onAddProxy,
  onImportExcel,
  onExportExcel,
  onDeleteSelected,
  onRemoveFailed,
  canDeleteSelected = false,
  deletingSelected = false,
  exporting = false,
  importing = false,
  removingFailed = false,
}: ProxiesToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onImportExcel(file)
      event.target.value = ''
    }
  }

  return (
    <div className="mt-5 border-b border-border pb-4">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
      <ListToolbar
        countLabel={<span>{total.toLocaleString()} proxy</span>}
        filters={
          <DropdownSelect
            options={filterOptions}
            value={filter}
            onChange={onFilterChange}
            prefix="Lọc"
            leadingIcon={<Filter className="size-4" />}
            menuClassName="w-40"
          />
        }
        primaryAction={{ label: 'Thêm Proxy', onClick: onAddProxy }}
        secondaryActions={[
          {
            id: 'import',
            label: importing ? 'Đang nhập...' : 'Nhập Excel',
            onSelect: () => fileInputRef.current?.click(),
            disabled: importing,
          },
          {
            id: 'export',
            label: exporting ? 'Đang xuất...' : 'Xuất Excel',
            onSelect: onExportExcel,
            disabled: exporting,
          },
          {
            id: 'delete',
            label: deletingSelected ? 'Đang xóa...' : 'Xóa đã chọn',
            onSelect: onDeleteSelected,
            disabled: !canDeleteSelected || deletingSelected,
            destructive: true,
            separatorBefore: true,
          },
          {
            id: 'remove-failed',
            label: removingFailed ? 'Đang xóa...' : 'Xóa thất bại',
            onSelect: onRemoveFailed,
            disabled: removingFailed,
            destructive: true,
          },
        ]}
      />
    </div>
  )
}
