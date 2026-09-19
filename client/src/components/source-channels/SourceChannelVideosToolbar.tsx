import { useTranslation } from 'react-i18next';
import { Button, DropdownSelect } from '../ui';
import type { SourceVideoDurationFilter } from '../../types/sourceChannel';

interface SourceChannelVideosToolbarProps {
  durationFilter: SourceVideoDurationFilter;
  onDurationFilterChange: (value: SourceVideoDurationFilter) => void;
  canDownload?: boolean;
  downloadDisabledReason?: string;
  onDownload?: () => void;
}

export function SourceChannelVideosToolbar({
  durationFilter,
  onDurationFilterChange,
  canDownload = true,
  downloadDisabledReason,
  onDownload,
}: SourceChannelVideosToolbarProps) {
  const { t } = useTranslation('source');

  const durationOptions: { value: SourceVideoDurationFilter; label: string }[] = [
    { value: 'all', label: t('filter.durationAll') },
    { value: 'under_8m', label: t('filter.durationUnder8m') },
    { value: '8m_30m', label: t('filter.duration8to30') },
    { value: '30m_60m', label: t('filter.duration30to60') },
    { value: 'over_60m', label: t('filter.durationOver60') },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <DropdownSelect
        label={t('videos.duration')}
        options={durationOptions}
        value={durationFilter}
        onChange={onDurationFilterChange}
      />
      {onDownload ? (
        <Button
          size="sm"
          variant="secondary"
          className="rounded-lg"
          disabled={!canDownload}
          title={downloadDisabledReason}
          onClick={onDownload}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12" />
            <path d="M8 11l4 4 4-4" />
            <path d="M4 19h16" />
          </svg>
          {t('videos.download')}
        </Button>
      ) : null}
    </div>
  );
}
