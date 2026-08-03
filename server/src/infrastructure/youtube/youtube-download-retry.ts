/** Delays after failed attempts before retrying (10s, then 20s → 3 attempts total). */
export const YOUTUBE_DOWNLOAD_RETRY_DELAYS_MS = [10_000, 20_000] as const;

export interface YoutubeDownloadRetryOptions {
  onRetry?: (info: { attempt: number; maxAttempts: number; delayMs: number; reason: string }) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withYoutubeDownloadRetries<T>(
  fn: () => Promise<T>,
  options?: YoutubeDownloadRetryOptions,
): Promise<T> {
  const maxAttempts = YOUTUBE_DOWNLOAD_RETRY_DELAYS_MS.length + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const reason = err instanceof Error ? err.message : 'Unknown error';
      const delayMs = YOUTUBE_DOWNLOAD_RETRY_DELAYS_MS[attempt - 1];

      if (delayMs === undefined) {
        break;
      }

      options?.onRetry?.({ attempt, maxAttempts, delayMs, reason });
      console.warn(
        `[youtube-download] failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${reason}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
