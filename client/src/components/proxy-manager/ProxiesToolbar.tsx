import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('browser')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filterOptions: { value: ProxyFilter; label: string }[] = [
    { value: 'all', label: t('proxy.filter.all') },
    { value: 'active', label: t('proxy.filter.active') },
    { value: 'failed', label: t('proxy.filter.failed') },
    { value: 'slow', label: t('proxy.filter.slow') },
    { value: 'expired', label: t('proxy.filter.expired') },
    { value: 'in_use', label: t('proxy.filter.inUse') },
  ]

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
        countLabel={<span>{t('proxy.toolbar.count', { count: total.toLocaleString() })}</span>}
        filters={
          <DropdownSelect
            options={filterOptions}
            value={filter}
            onChange={onFilterChange}
            prefix={t('proxy.toolbar.filterPrefix')}
            leadingIcon={<Filter className="size-4" />}
            menuClassName="w-40"
          />
        }
        primaryAction={{ label: t('proxy.toolbar.add'), onClick: onAddProxy }}
        secondaryActions={[
          {
            id: 'import',
            label: importing ? t('proxy.toolbar.importing') : t('proxy.toolbar.import'),
            onSelect: () => fileInputRef.current?.click(),
            disabled: importing,
          },
          {
            id: 'export',
            label: exporting ? t('proxy.toolbar.exporting') : t('proxy.toolbar.export'),
            onSelect: onExportExcel,
            disabled: exporting,
          },
          {
            id: 'delete',
            label: deletingSelected ? t('proxy.toolbar.deleting') : t('proxy.toolbar.deleteSelected'),
            onSelect: onDeleteSelected,
            disabled: !canDeleteSelected || deletingSelected,
            destructive: true,
            separatorBefore: true,
          },
          {
            id: 'remove-failed',
            label: removingFailed ? t('proxy.toolbar.deleting') : t('proxy.toolbar.removeFailed'),
            onSelect: onRemoveFailed,
            disabled: removingFailed,
            destructive: true,
          },
        ]}
      />
    </div>
  )
}
