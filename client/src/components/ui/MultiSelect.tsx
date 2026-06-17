import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingMenuPosition } from '../../hooks';
import { cn } from '../../lib/cn';
import type { DropdownSelectOption } from './DropdownSelect';

export interface MultiSelectProps<T extends string = string> {
  options: DropdownSelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  onBlur?: () => void;
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function MultiSelect<T extends string>({
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  searchable = false,
  searchPlaceholder = 'Search...',
  disabled = false,
  id,
  className,
  triggerClassName,
  menuClassName,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { menuStyle } = useFloatingMenuPosition(open, triggerRef, menuRef);
  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((opt): opt is DropdownSelectOption<T> => opt != null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOptions =
    searchable && normalizedQuery
      ? options.filter((opt) => opt.label.toLowerCase().includes(normalizedQuery))
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

  function toggleOption(optionValue: T) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  }

  function removeOption(optionValue: T, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  }

  useEffect(() => {
    if (!open || !searchable) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen((wasOpen) => {
        if (wasOpen) onBlur?.();
        return false;
      });
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onBlur]);

  const menu = open ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className={cn(
        'rounded-xl border border-border bg-surface-elevated shadow-lg',
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
          filteredOptions.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => toggleOption(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-800 disabled:opacity-50',
                  selected ? 'text-secondary-400' : 'text-neutral-200',
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    selected ? 'border-secondary-400 bg-secondary-400/20' : 'border-neutral-600',
                  )}
                >
                  {selected ? <CheckIcon className="size-3 text-secondary-400" /> : null}
                </span>
                <span className="min-w-0 truncate">{opt.label}</span>
              </button>
            );
          })
        ) : (
          <p className="px-3 py-2 text-sm text-neutral-500">No results found</p>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) closeMenu();
          else openMenu();
        }}
        className={cn(
          'inline-flex min-h-9 min-w-[9rem] w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800',
          'transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selectedOptions.length === 0 ? (
            <span className="px-1 text-neutral-500">{placeholder ?? 'Select options'}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-neutral-800/80 py-0.5 pl-2 pr-1 text-xs text-neutral-200"
              >
                <span className="min-w-0 truncate">{opt.label}</span>
                {!disabled ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${opt.label}`}
                    onMouseDown={(e) => removeOption(opt.value, e)}
                    className="shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
                  >
                    <CloseIcon className="size-3" />
                  </span>
                ) : null}
              </span>
            ))
          )}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-neutral-500" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
