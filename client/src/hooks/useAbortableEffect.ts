import { useEffect, type DependencyList } from 'react';
import { isAbortError } from '../api/http';

export interface UseAbortableEffectOptions {
  enabled?: boolean;
}

export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: DependencyList,
  { enabled = true }: UseAbortableEffectOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    void Promise.resolve(effect(controller.signal)).catch((err) => {
      if (!isAbortError(err)) {
        console.error(err);
      }
    });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, [enabled, ...deps]);
}
