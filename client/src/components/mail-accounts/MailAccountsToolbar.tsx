import { Button } from '../ui';

interface MailAccountsToolbarProps {
  total: number;
  onAddMail: () => void;
  onExportExcel: () => void;
  exporting?: boolean;
}

export function MailAccountsToolbar({
  total,
  onAddMail,
  onExportExcel,
  exporting = false,
}: MailAccountsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <span className="text-sm text-neutral-400">{total.toLocaleString()} Accounts Total</span>

      <div className="flex items-center gap-3">
        <button type="button" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Import Excel
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
          {exporting ? 'Exporting...' : 'Export Excel'}
        </button>
        <Button size="sm" className="rounded-lg" onClick={onAddMail}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Add Mail
        </Button>
      </div>
    </div>
  );
}
