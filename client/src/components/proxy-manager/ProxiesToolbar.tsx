import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter } from 'lucide-react'
import { ListToolbar } from '../layout'
import { Button, DropdownSelect } from '../ui'
import type { ProxyFilter } from '../../types/proxy'

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
        extraActions={
          <>
            <Button
              variant="outlined"
              size="sm"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? t('proxy.toolbar.importing') : t('proxy.toolbar.import')}
            </Button>
            <Button variant="outlined" size="sm" disabled={exporting} onClick={onExportExcel}>
              {exporting ? t('proxy.toolbar.exporting') : t('proxy.toolbar.export')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!canDeleteSelected || deletingSelected}
              onClick={onDeleteSelected}
            >
              {deletingSelected ? t('proxy.toolbar.deleting') : t('proxy.toolbar.deleteSelected')}
            </Button>
            <Button variant="danger" size="sm" disabled={removingFailed} onClick={onRemoveFailed}>
              {removingFailed ? t('proxy.toolbar.deleting') : t('proxy.toolbar.removeFailed')}
            </Button>
          </>
        }
        primaryAction={{ label: t('proxy.toolbar.add'), onClick: onAddProxy }}
      />
    </div>
  )
}
