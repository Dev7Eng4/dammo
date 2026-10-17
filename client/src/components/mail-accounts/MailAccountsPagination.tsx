import { useTranslation } from 'react-i18next';
import { Button, DropdownSelect } from '../ui';
import { cn } from '../../lib/cn';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

const PAGE_SIZE_SELECT_OPTIONS = PAGE_SIZE_OPTIONS.map(size => ({
  value: String(size),
  label: String(size),
}));

/** Page numbers to show: always first/last, the current page ±1, with 'gap' markers in between. */
export function buildPageItems(page: number, totalPages: number): Array<number | 'gap'> {
  const wanted = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  // Keep the control a stable width near the edges (1 2 3 4 … N instead of 1 2 3 … N).
  if (page <= 3) [2, 3, 4].forEach(n => wanted.add(n));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach(n => wanted.add(n));

  const pages = [...wanted].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const items: Array<number | 'gap'> = [];
  pages.forEach((n, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined) {
      if (n - previous === 2) items.push(previous + 1); // a single hidden page: show it instead of "…"
      else if (n - previous > 2) items.push('gap');
    }
    items.push(n);
  });
  return items;
}

interface MailAccountsPaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  locale?: 'en' | 'vi';
}

export function MailAccountsPagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  locale,
}: MailAccountsPaginationProps) {
  const { t, i18n } = useTranslation('common');

  if (total === 0) return null;

  const lang = locale ?? (i18n.language.startsWith('vi') ? 'vi' : 'en');
  const numberLocale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-neutral-400">
          {t('pagination.showing')} {start.toLocaleString(numberLocale)}–
          {end.toLocaleString(numberLocale)} {t('pagination.of')}{' '}
          {total.toLocaleString(numberLocale)}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">{t('pagination.perPage')}</span>
          <DropdownSelect
            options={PAGE_SIZE_SELECT_OPTIONS}
            value={String(limit)}
            onChange={value => onLimitChange(Number(value))}
            className="w-[4.75rem]"
            triggerClassName="h-8 w-full min-w-0 rounded-lg px-2.5 text-sm"
            menuClassName="w-[4.75rem]"
            id="page-size"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('pagination.prev')}
        </Button>
        <nav className="flex items-center gap-1" aria-label={t('pagination.page')}>
          {buildPageItems(page, totalPages).map((item, index) =>
            item === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-neutral-500" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => item !== page && onPageChange(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`${t('pagination.page')} ${item}`}
                className={cn(
                  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors',
                  item === page
                    ? 'cursor-default bg-primary-500 text-on-primary'
                    : 'text-neutral-300 hover:bg-surface-elevated hover:text-foreground',
                )}
              >
                {item.toLocaleString(numberLocale)}
              </button>
            ),
          )}
        </nav>
        <Button
          variant="outlined"
          size="sm"
          className={cn('rounded-lg')}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  );
}
