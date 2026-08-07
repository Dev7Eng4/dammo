import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  widthClassName?: string;
  headerActions?: ReactNode;
  /** push = side panel in layout on lg; overlay = always fixed with backdrop */
  placement?: 'push' | 'overlay';
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
  widthClassName = 'w-full max-w-md lg:w-96',
  headerActions,
  placement = 'push',
}: DrawerProps) {
  const isOverlay = placement === 'overlay';

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className={cn('fixed inset-0 z-40 bg-black/50', !isOverlay && 'lg:hidden')}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface shadow-xl',
          !isOverlay && 'lg:static lg:z-auto lg:shadow-none',
          widthClassName,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-neutral-100">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-neutral-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-neutral-500 hover:text-neutral-200"
              aria-label="Close drawer"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </>
  );
}
