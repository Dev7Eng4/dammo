import { useTranslation } from 'react-i18next';
import { Button, DropdownSelect } from '../ui';
import { cn } from '../../lib/cn';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

const PAGE_SIZE_SELECT_OPTIONS = PAGE_SIZE_OPTIONS.map(size => ({
  value: String(size),
  label: String(size),
}));

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
        <span className="text-sm text-neutral-400">
          {t('pagination.page')} {page} {t('pagination.of')} {totalPages}
        </span>
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
