import { Button, DropdownSelect } from '../ui';
import { YOUTUBE_CHANNEL_TYPE_LABELS, type YoutubeChannelTypeFilter, type YoutubeMonetizationFilter } from '../../types/youtubeChannel';

interface YoutubeChannelsToolbarProps {
  typeFilter: YoutubeChannelTypeFilter;
  monetizationFilter: YoutubeMonetizationFilter;
  search: string;
  onTypeFilterChange: (value: YoutubeChannelTypeFilter) => void;
  onMonetizationFilterChange: (value: YoutubeMonetizationFilter) => void;
  onSearchChange: (value: string) => void;
  onAddChannel: () => void;
}

const typeOptions: { value: YoutubeChannelTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  ...(['content', 'reup', 'content_sale'] as const).map((value) => ({
    value,
    label: YOUTUBE_CHANNEL_TYPE_LABELS[value],
  })),
];

const monetizationOptions: { value: YoutubeMonetizationFilter; label: string }[] = [
  { value: 'all', label: 'Monetization: All' },
  { value: 'monetized', label: 'Monetized' },
  { value: 'in_review', label: 'In Review' },
  { value: 'demonetized', label: 'Demonetized' },
  { value: 'limited', label: 'Limited' },
];

export function YoutubeChannelsToolbar({
  typeFilter,
  monetizationFilter,
  search,
  onTypeFilterChange,
  onMonetizationFilterChange,
  onSearchChange,
  onAddChannel,
}: YoutubeChannelsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownSelect options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} />
        <DropdownSelect
          options={monetizationOptions}
          value={monetizationFilter}
          onChange={onMonetizationFilterChange}
        />
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={typeof search === 'string' ? search : ''}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            placeholder="Filter channels..."
            className="h-8 w-48 rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 lg:w-56"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Import/Export
        </button>
        <Button size="sm" className="rounded-lg" onClick={onAddChannel}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Add Channel
        </Button>
      </div>
    </div>
  );
}
