export interface FetchOptions {
  signal?: AbortSignal;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function parseApiError(body: unknown, status: number): string {
  if (!body || typeof body !== 'object') {
    return `Request failed: ${status}`;
  }

  const record = body as Record<string, unknown>;
  const error = record.error;

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    const message = errObj.message;

    if (typeof message === 'string') {
      try {
        const parsed = JSON.parse(message) as Array<{ message?: string }>;
        if (Array.isArray(parsed)) {
          const first = parsed.find((item) => typeof item?.message === 'string');
          if (first?.message) return first.message;
        }
      } catch {
        // message is plain text
      }
      if (message.trim()) return message;
    }
  }

  return `Request failed: ${status}`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, res.status));
  }
  return res.json() as Promise<T>;
}

export function withSignal(init: RequestInit | undefined, options?: FetchOptions): RequestInit {
  if (!options?.signal) return init ?? {};
  return { ...init, signal: options.signal };
}
