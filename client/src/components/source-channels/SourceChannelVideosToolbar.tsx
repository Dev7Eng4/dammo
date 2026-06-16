import { DropdownSelect } from '../ui';
import type { SourceVideoDurationFilter } from '../../types/sourceChannel';

interface SourceChannelVideosToolbarProps {
  durationFilter: SourceVideoDurationFilter;
  onDurationFilterChange: (value: SourceVideoDurationFilter) => void;
}

const durationOptions: { value: SourceVideoDurationFilter; label: string }[] = [
  { value: 'all', label: 'All Durations' },
  { value: 'under_1m', label: 'Under 1 min' },
  { value: '1m_10m', label: '1 – 10 min' },
  { value: '10m_30m', label: '10 – 30 min' },
  { value: 'over_30m', label: 'Over 30 min' },
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
