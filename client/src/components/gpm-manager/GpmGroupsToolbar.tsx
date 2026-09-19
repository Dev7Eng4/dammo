import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['browser', 'common']);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-400">
          {t('gpm.groups.count', { count: count.toLocaleString() })}
        </span>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('gpm.groups.search')}
          className="h-9 w-48 rounded-lg text-sm"
          disabled={loading}
        />
        {readOnly ? (
          <span className="text-xs text-neutral-500">{t('gpm.groups.readonly')}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onRefresh} disabled={loading}>
          {t('common:actions.refresh')}
        </Button>
        {!readOnly && onAddGroup ? (
          <Button size="sm" className="rounded-lg" onClick={onAddGroup} disabled={loading}>
            {t('gpm.groups.create')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
