import { Button, DropdownSelect } from '../ui';
import type { SourceVideoDurationFilter } from '../../types/sourceChannel';

interface SourceChannelVideosToolbarProps {
  durationFilter: SourceVideoDurationFilter;
  onDurationFilterChange: (value: SourceVideoDurationFilter) => void;
  canDownload?: boolean;
  downloadDisabledReason?: string;
  onDownload?: () => void;
}

const durationOptions: { value: SourceVideoDurationFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả thời lượng' },
  { value: 'under_8m', label: 'Dưới 8 phút' },
  { value: '8m_30m', label: '8 – 30 phút' },
  { value: '30m_60m', label: '30 – 60 phút' },
  { value: 'over_60m', label: 'Trên 60 phút' },
];

export function SourceChannelVideosToolbar({
  durationFilter,
  onDurationFilterChange,
  canDownload = true,
  downloadDisabledReason,
  onDownload,
}: SourceChannelVideosToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <DropdownSelect
        label="Thời lượng"
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
          Tải xuống
        </Button>
      ) : null}
    </div>
  );
}
