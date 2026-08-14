import { useEffect, useMemo, useState } from 'react';

export interface UseClientPaginatedListOptions {
  limit?: number;
  resetKey?: string | number;
}

export interface UseClientPaginatedListResult<TItem> {
  pageItems: TItem[];
  page: number;
  total: number;
  totalPages: number;
  limit: number;
  setPage: (page: number) => void;
  resetPage: () => void;
}

export function useClientPaginatedList<TItem>(
  items: TItem[],
  { limit = 20, resetKey = 0 }: UseClientPaginatedListOptions = {},
): UseClientPaginatedListResult<TItem> {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    setPage(1);
  }, [limit]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * limit;
    return items.slice(start, start + limit);
  }, [items, safePage, limit]);

  return {
    pageItems,
    page: safePage,
    total,
    totalPages,
    limit,
    setPage,
    resetPage: () => setPage(1),
  };
}
