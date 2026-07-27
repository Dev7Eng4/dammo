import { Button, DropdownSelect } from '../ui';
import type {
  SourcePlatformFilter,
  SourcePurposeFilter,
  SourceRiskFilter,
} from '../../types/sourceChannel';

interface SourceChannelsToolbarProps {
  platformFilter: SourcePlatformFilter;
  purposeFilter: SourcePurposeFilter;
  riskFilter: SourceRiskFilter;
  search: string;
  canDownload?: boolean;
  downloadDisabledReason?: string;
  canDelete?: boolean;
  onPlatformFilterChange: (value: SourcePlatformFilter) => void;
  onPurposeFilterChange: (value: SourcePurposeFilter) => void;
  onRiskFilterChange: (value: SourceRiskFilter) => void;
  onSearchChange: (value: string) => void;
  onAddSource: () => void;
  onAddNiche?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
}

const platformOptions: { value: SourcePlatformFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả nền tảng' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
];

const purposeOptions: { value: SourcePurposeFilter; label: string }[] = [
  { value: 'all', label: 'Mọi mục đích' },
  { value: 'trend_tracking', label: 'Theo dõi xu hướng' },
  { value: 'idea_reference', label: 'Tham khảo ý tưởng' },
  { value: 'licensed_source', label: 'Nguồn có bản quyền' },
  { value: 'competitor_tracking', label: 'Theo dõi đối thủ' },
  { value: 'reup', label: 'Reup' },
  { value: 'background_footage', label: 'Footage nền' },
];

const riskOptions: { value: SourceRiskFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả mức' },
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
];

export function SourceChannelsToolbar({
  platformFilter,
  purposeFilter,
  riskFilter,
  search,
  canDownload = true,
  downloadDisabledReason,
  canDelete = false,
  onPlatformFilterChange,
  onPurposeFilterChange,
  onRiskFilterChange,
  onSearchChange,
  onAddSource,
  onAddNiche,
  onDownload,
  onDelete,
}: SourceChannelsToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <div className="flex flex-wrap items-end gap-4">
        <DropdownSelect
          label="Nền tảng"
          options={platformOptions}
          value={platformFilter}
          onChange={onPlatformFilterChange}
        />
        <DropdownSelect
          label="Mục đích"
          options={purposeOptions}
          value={purposeFilter}
          onChange={onPurposeFilterChange}
        />
        <DropdownSelect
          label="Rủi ro"
          options={riskOptions}
          value={riskFilter}
          onChange={onRiskFilterChange}
        />
      </div>

      <div className="flex items-center gap-3">
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
            placeholder="Lọc nguồn..."
            className="h-8 w-48 rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 lg:w-56"
          />
        </div>
        {onDelete ? (
          <Button
            size="sm"
            variant="danger"
            className="rounded-lg"
            disabled={!canDelete}
            onClick={onDelete}
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Xóa
          </Button>
        ) : null}
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
        {onAddNiche ? (
          <Button size="sm" variant="secondary" className="rounded-lg" onClick={onAddNiche}>
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Thêm niche
          </Button>
        ) : null}
        <Button size="sm" className="rounded-lg" onClick={onAddSource}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Thêm nguồn
        </Button>
      </div>
    </div>
  );
}
