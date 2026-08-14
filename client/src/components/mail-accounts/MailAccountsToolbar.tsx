import { Button } from '../ui';

interface MailAccountsToolbarProps {
  total: number;
  search?: string;
  canEdit?: boolean;
  editDisabledReason?: string;
  canDelete?: boolean;
  deleteDisabledReason?: string;
  deleting?: boolean;
  onSearchChange?: (value: string) => void;
  onAddMail: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExportExcel: () => void;
  exporting?: boolean;
}

export function MailAccountsToolbar({
  total,
  search = '',
  canEdit = false,
  editDisabledReason,
  canDelete = false,
  deleteDisabledReason,
  deleting = false,
  onSearchChange,
  onAddMail,
  onEdit,
  onDelete,
  onExportExcel,
  exporting = false,
}: MailAccountsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-400">{total.toLocaleString()} tài khoản</span>
        {onSearchChange ? (
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
              placeholder="Tìm theo email..."
              className="h-10 w-48 rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 lg:w-56"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Nhập Excel
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={onExportExcel}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
        {onEdit ? (
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg"
            disabled={!canEdit}
            title={!canEdit ? editDisabledReason : undefined}
            onClick={onEdit}
          >
            Sửa
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="danger"
            size="sm"
            className="rounded-lg"
            disabled={deleting || !canDelete}
            title={!deleting && !canDelete ? deleteDisabledReason : undefined}
            onClick={onDelete}
          >
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        ) : null}
        <Button size="sm" className="rounded-lg" onClick={onAddMail}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Thêm email
        </Button>
      </div>
    </div>
  );
}
