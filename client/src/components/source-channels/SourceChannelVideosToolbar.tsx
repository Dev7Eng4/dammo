import { DropdownSelect } from '../ui';
import type { SourceVideoDurationFilter } from '../../types/sourceChannel';

interface SourceChannelVideosToolbarProps {
  durationFilter: SourceVideoDurationFilter;
  onDurationFilterChange: (value: SourceVideoDurationFilter) => void;
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
}: SourceChannelVideosToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <DropdownSelect
        label="Thời lượng"
        options={durationOptions}
        value={durationFilter}
        onChange={onDurationFilterChange}
      />
    </div>
  );
}
