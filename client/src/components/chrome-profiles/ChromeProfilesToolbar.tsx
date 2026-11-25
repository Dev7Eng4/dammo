import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { appLocale } from '../../utils/locale';

interface ChromeProfilesToolbarProps {
  count: number;
  loading?: boolean;
  opening?: boolean;
  canOpen?: boolean;
  canEdit?: boolean;
  onAddProfile: () => void;
  onEditProfile: () => void;
  onOpenProfile: () => void;
}

export function ChromeProfilesToolbar({
  count,
  loading,
  opening,
  canOpen,
  canEdit,
  onAddProfile,
  onEditProfile,
  onOpenProfile,
}: ChromeProfilesToolbarProps) {
  const { t } = useTranslation('browser');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-neutral-400">
        {t('chrome.toolbar.count', { count: count.toLocaleString(appLocale()) })}
      </span>

      <div className="flex items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onEditProfile}
          disabled={!canEdit || loading || opening}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {t('chrome.toolbar.editName')}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onOpenProfile}
          disabled={!canOpen || opening || loading}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
          {opening ? t('chrome.toolbar.opening') : t('chrome.toolbar.open')}
        </Button>
        <Button size="sm" className="rounded-lg" onClick={onAddProfile}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          {t('chrome.toolbar.add')}
        </Button>
      </div>
    </div>
  );
}
