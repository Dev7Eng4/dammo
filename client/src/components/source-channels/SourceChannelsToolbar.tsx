import { Button, DropdownSelect } from '../ui';
import type { Niche } from '../../types/niche';
import type {
  SourceLanguageFilter,
  SourcePlatformFilter,
  SourcePurposeFilter,
} from '../../types/sourceChannel';
import { SOURCE_CHANNEL_LANGUAGE_LABELS } from '../../types/sourceChannel';

interface SourceChannelsToolbarProps {
  platformFilter: SourcePlatformFilter;
  purposeFilter: SourcePurposeFilter;
  languageFilter: SourceLanguageFilter;
  nicheFilter: string;
  search: string;
  niches: Niche[];
  canDownload?: boolean;
  downloadDisabledReason?: string;
  canDelete?: boolean;
  onPlatformFilterChange: (value: SourcePlatformFilter) => void;
  onPurposeFilterChange: (value: SourcePurposeFilter) => void;
  onLanguageFilterChange: (value: SourceLanguageFilter) => void;
  onNicheFilterChange: (value: string) => void;
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
  { value: 'reup', label: 'Reup' },
  { value: 'background_footage', label: 'Footage nền' },
];

const languageOptions: { value: SourceLanguageFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả ngôn ngữ' },
  ...(Object.entries(SOURCE_CHANNEL_LANGUAGE_LABELS) as [Exclude<SourceLanguageFilter, 'all'>, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

export function SourceChannelsToolbar({
  platformFilter,
  purposeFilter,
  languageFilter,
  nicheFilter,
  search,
  niches,
  canDownload = true,
  downloadDisabledReason,
  canDelete = false,
  onPlatformFilterChange,
  onPurposeFilterChange,
  onLanguageFilterChange,
  onNicheFilterChange,
  onSearchChange,
  onAddSource,
  onAddNiche,
  onDownload,
  onDelete,
}: SourceChannelsToolbarProps) {
  const nicheOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'Tất cả niche' },
    ...niches.map((item) => ({ value: item.key, label: item.label })),
  ];

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Tên
            </span>
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
                value={search}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                placeholder="Lọc theo tên..."
                className="w-48 rounded-lg border border-border bg-surface-elevated py-1.5 pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 lg:w-56"
              />
            </div>
          </div>
          <DropdownSelect
            label="Niche"
            options={nicheOptions}
            value={nicheFilter}
            onChange={onNicheFilterChange}
            triggerClassName="min-w-[18rem]"
          />
          <DropdownSelect
            label="Ngôn ngữ"
            options={languageOptions}
            value={languageFilter}
            onChange={onLanguageFilterChange}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <DropdownSelect
            label="Mục đích"
            options={purposeOptions}
            value={purposeFilter}
            onChange={onPurposeFilterChange}
          />
          <DropdownSelect
            label="Nền tảng"
            options={platformOptions}
            value={platformFilter}
            onChange={onPlatformFilterChange}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
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
