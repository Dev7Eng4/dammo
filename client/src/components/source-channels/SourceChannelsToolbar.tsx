import { Button, DropdownSelect } from '../ui';
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
  canDownload?: boolean;
  downloadDisabledReason?: string;
  canDelete?: boolean;
  onPlatformFilterChange: (value: SourcePlatformFilter) => void;
  onPurposeFilterChange: (value: SourcePurposeFilter) => void;
  onLanguageFilterChange: (value: SourceLanguageFilter) => void;
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
  canDownload = true,
  downloadDisabledReason,
  canDelete = false,
  onPlatformFilterChange,
  onPurposeFilterChange,
  onLanguageFilterChange,
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
          label="Ngôn ngữ"
          options={languageOptions}
          value={languageFilter}
          onChange={onLanguageFilterChange}
        />
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
