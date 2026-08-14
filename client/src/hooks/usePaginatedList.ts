import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../api/http';
import type { PaginatedResponse } from '../types/pagination';

export interface UsePaginatedListOptions<TItem, TQuery extends object> {
  fetcher: (
    args: TQuery & { page: number; limit: number; signal?: AbortSignal },
  ) => Promise<PaginatedResponse<TItem>>;
  query: TQuery;
  limit?: number;
  enabled?: boolean;
  refreshKey?: number;
  onFetched?: (data: PaginatedResponse<TItem>) => void;
}

export interface UsePaginatedListResult<TItem> {
  items: TItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  resetPage: () => void;
  refresh: () => void;
  markLoading: () => void;
}

export function usePaginatedList<TItem, TQuery extends object>({
  fetcher,
  query,
  limit = 20,
  enabled = true,
  refreshKey = 0,
  onFetched,
}: UsePaginatedListOptions<TItem, TQuery>): UsePaginatedListResult<TItem> {
  const [items, setItems] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  const prevLimitRef = useRef(limit);

  const fetcherRef = useRef(fetcher);
  const onFetchedRef = useRef(onFetched);

  useEffect(() => {
    fetcherRef.current = fetcher;
    onFetchedRef.current = onFetched;
  });

  const queryKey = JSON.stringify(query);
  const effectiveRefreshKey = refreshKey + internalRefreshKey;

  const markLoading = useCallback(() => {
    setLoading(true);
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    setInternalRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (prevLimitRef.current !== limit) {
      prevLimitRef.current = limit;
      setPage(1);
    }
  }, [limit]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    fetcherRef
      .current({ ...(JSON.parse(queryKey) as TQuery), page, limit, signal: controller.signal })
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setError(null);
        onFetchedRef.current?.(data);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [queryKey, page, limit, enabled, effectiveRefreshKey]);

  return {
    items,
    total,
    page,
    totalPages,
    limit,
    loading,
    error,
    setPage,
    resetPage,
    refresh,
    markLoading,
  };
}
