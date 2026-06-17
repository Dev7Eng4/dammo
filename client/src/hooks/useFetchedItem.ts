import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../api/http';

export interface UseFetchedItemResult<T> {
  item: T | null;
  loading: boolean;
  load: (id: string) => void;
  clear: () => void;
}

export function useFetchedItem<T>(
  fetcher: (id: string, signal?: AbortSignal) => Promise<T>,
): UseFetchedItemResult<T> {
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestRef.current += 1;
    setItem(null);
    setLoading(false);
  }, []);

  const load = useCallback((id: string) => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;

    setLoading(true);
    setItem(null);

    void fetcherRef
      .current(id, controller.signal)
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setItem(data);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        if (requestId !== requestRef.current) return;
        setItem(null);
      })
      .finally(() => {
        if (requestId !== requestRef.current) return;
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  return { item, loading, load, clear };
}
