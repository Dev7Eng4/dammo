import { Button } from '../ui';
import { cn } from '../../lib/cn';

interface MailAccountsPaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  locale?: 'en' | 'vi';
}

export function MailAccountsPagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  locale = 'en',
}: MailAccountsPaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const numberLocale = locale === 'vi' ? 'vi-VN' : 'en-US';

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-neutral-400">
        {locale === 'vi' ? 'Hiển thị' : 'Showing'} {start.toLocaleString(numberLocale)}–
        {end.toLocaleString(numberLocale)} {locale === 'vi' ? 'trên' : 'of'}{' '}
        {total.toLocaleString(numberLocale)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {locale === 'vi' ? 'Trước' : 'Previous'}
        </Button>
        <span className="text-sm text-neutral-400">
          {locale === 'vi' ? 'Trang' : 'Page'} {page} {locale === 'vi' ? 'trên' : 'of'} {totalPages}
        </span>
        <Button
          variant="outlined"
          size="sm"
          className={cn('rounded-lg')}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {locale === 'vi' ? 'Sau' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
