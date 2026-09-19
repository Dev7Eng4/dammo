import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['browser', 'common'])
  const busy = loading || starting || stopping || testing || deleting

  return (
    <ListToolbar
      countLabel={<span>{t('gpm.profiles.count', { count: count.toLocaleString() })}</span>}
      filters={
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('gpm.profiles.search')}
          className="h-9 w-48 text-sm"
          disabled={busy}
        />
      }
      extraActions={
        <>
          <Button variant="outlined" size="sm" onClick={onRefresh} disabled={busy}>
            {t('common:actions.refresh')}
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="border-success/30 text-success hover:border-success/50 hover:bg-success/10"
            onClick={onStart}
            disabled={!canStart || starting || busy}
          >
            {starting ? t('gpm.profiles.starting') : t('gpm.profiles.start')}
          </Button>
          <Button variant="danger" size="sm" onClick={onStop} disabled={!canStop || stopping || busy}>
            {stopping ? t('gpm.profiles.stopping') : t('gpm.profiles.stop')}
          </Button>
          <Button variant="outlined" size="sm" onClick={onTest} disabled={!canTest || testing || busy}>
            {testing ? t('gpm.profiles.testing') : t('gpm.profiles.test')}
          </Button>
          <Button variant="outlined" size="sm" onClick={onEdit} disabled={!canEdit || busy}>
            {t('gpm.profiles.edit')}
          </Button>
          <Button
            variant="outlined"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={onDelete}
            disabled={!canDelete || deleting || busy}
          >
            {deleting ? t('common:actions.deleting') : t('gpm.profiles.delete')}
          </Button>
        </>
      }
      primaryAction={{ label: t('gpm.profiles.add'), onClick: onAddProfile, disabled: busy }}
    />
  )
}
