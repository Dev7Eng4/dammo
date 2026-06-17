import { DropdownSelect } from '../ui';
import type { SourceVideoDurationFilter } from '../../types/sourceChannel';

interface SourceChannelVideosToolbarProps {
  durationFilter: SourceVideoDurationFilter;
  onDurationFilterChange: (value: SourceVideoDurationFilter) => void;
}

const durationOptions: { value: SourceVideoDurationFilter; label: string }[] = [
  { value: 'all', label: 'All durations' },
  { value: 'under_8m', label: 'Under 8 minutes' },
  { value: '8m_30m', label: '8 – 30 minutes' },
  { value: '30m_60m', label: '30 – 60 minutes' },
  { value: 'over_60m', label: 'Over 60 minutes' },
];

export function SourceChannelVideosToolbar({
  durationFilter,
  onDurationFilterChange,
}: SourceChannelVideosToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <DropdownSelect
        label="Duration"
        options={durationOptions}
        value={durationFilter}
        onChange={onDurationFilterChange}
      />
    </div>
  );
}
