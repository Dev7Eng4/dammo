import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface DropdownSelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface DropdownSelectProps<T extends string = string> {
  options: DropdownSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onBlur?: () => void;
  label?: string;
  prefix?: string;
  leadingIcon?: ReactNode;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function optionLabel(label: string): string {
  return typeof label === 'string' ? label : '';
}

export function DropdownSelect<T extends string>({
  options,
  value,
  onChange,
  onBlur,
  label,
  prefix,
  leadingIcon,
  placeholder,
  searchable = false,
  searchPlaceholder = 'Search...',
  disabled = false,
  id,
  className,
  triggerClassName,
  menuClassName,
}: DropdownSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const activeLabel = selected ? optionLabel(selected.label) : (placeholder ?? optionLabel(options[0]?.label ?? ''));
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOptions =
    searchable && normalizedQuery
      ? options.filter((opt) => optionLabel(opt.label).toLowerCase().includes(normalizedQuery))
      : options;

  function closeMenu() {
    setOpen(false);
    setSearchQuery('');
    onBlur?.();
  }

  function openMenu() {
    setSearchQuery('');
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !searchable) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen((wasOpen) => {
          if (wasOpen) onBlur?.();
          return false;
        });
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onBlur]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label ? (
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      ) : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) closeMenu();
          else openMenu();
        }}
        className={cn(
          'inline-flex min-w-[9rem] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800',
          'transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && placeholder ? 'text-neutral-500' : null,
          triggerClassName,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          {leadingIcon}
          {prefix ? (
            <>
              <span>{prefix}</span>
              <span className="text-neutral-500">· {activeLabel}</span>
            </>
          ) : (
            activeLabel
          )}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-neutral-500" />
      </button>
      {open ? (
        <div
          className={cn(
            'absolute top-full z-30 mt-1 min-w-full rounded-xl border border-border bg-surface-elevated shadow-lg',
            searchable ? 'flex max-h-60 flex-col overflow-hidden' : 'scrollbar-thin max-h-60 overflow-y-auto overscroll-contain py-1',
            menuClassName,
          )}
        >
          {searchable ? (
            <div className="shrink-0 border-b border-border p-2">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30"
                />
              </div>
            </div>
          ) : null}
          <div className={cn(searchable ? 'scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain py-1' : null)}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChange(opt.value);
                    closeMenu();
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-neutral-800 disabled:opacity-50',
                    value === opt.value ? 'text-secondary-400' : 'text-neutral-200',
                  )}
                >
                  {optionLabel(opt.label)}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-neutral-500">No results found</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
