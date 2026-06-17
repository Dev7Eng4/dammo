import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAbortError } from '../api/http';
import { SearchInput } from '../components/ui';
import { cn } from '../lib/cn';
import { fetchSearch } from '../api/dashboard';
import type { SearchResult, SearchResultType } from '../types/dashboard';

const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  mail_account: 'Mail account',
  youtube_channel: 'YouTube channel',
  source_channel: 'Source channel',
  project: 'Project',
  account: 'Account',
  render: 'Render',
};

function toSearchText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function IconButton({ children, badge, className }: { children: React.ReactNode; badge?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex size-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-surface-elevated hover:text-neutral-100',
        className,
      )}
    >
      {children}
      {badge ? (
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" />
      ) : null}
    </button>
  );
}

export function Header() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchControllerRef = useRef<AbortController | null>(null);

  async function handleSearch(value: string) {
    const nextQuery = toSearchText(value);
    setQuery(nextQuery);

    searchControllerRef.current?.abort();

    if (!nextQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const controller = new AbortController();
    searchControllerRef.current = controller;

    try {
      const data = await fetchSearch(nextQuery, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResults(data.results);
      setShowResults(true);
    } catch (err) {
      if (isAbortError(err)) return;
      setResults([]);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      <h1 className="shrink-0 text-sm font-semibold text-neutral-100">Local Workspace</h1>

      <div className="relative mx-auto w-full max-w-md">
        <SearchInput
          placeholder="Search operations..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          className="h-9 text-sm"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-neutral-500">
          ⌘K
        </span>
        {showResults && results.length > 0 ? (
          <div className="absolute top-full z-50 mt-1 w-full rounded-xl border border-border bg-surface-elevated py-1 shadow-lg">
            {results.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                to={item.path}
                className="block px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="text-xs text-neutral-500">
                  {SEARCH_TYPE_LABELS[item.type] ?? item.type}
                </span>
                <p className="truncate">{toSearchText(item.label)}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button type="button" className="text-xs font-medium text-neutral-400 hover:text-neutral-100">
          NEW PROJECT
        </button>
        <button type="button" className="text-xs font-medium text-neutral-400 hover:text-neutral-100">
          IMPORT EXCEL
        </button>

        <IconButton>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </IconButton>
        <IconButton>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </IconButton>
        <IconButton badge>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </IconButton>
        <div className="flex size-8 items-center justify-center rounded-full bg-primary-600 text-xs font-medium text-white">
          D
        </div>
      </div>
    </header>
  );
}
