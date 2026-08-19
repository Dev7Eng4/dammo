import { AppError } from '../../shared/http/errors.js';

export interface YoutubeDownloadFallbackOptions<T> {
  action: string;
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  primaryLabel?: string;
  fallbackLabel?: string;
  onLog?: (msg: string) => void;
}

const SKIP_FALLBACK_CODES = new Set(['INVALID_VIDEO_URL', 'FFMPEG_NOT_FOUND']);

function errorCode(err: unknown): string | undefined {
  return err instanceof AppError ? err.code : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return String(err);
}

/**
 * Tries yt-dlp first, then youtubei.js. Skips fallback for invalid URLs and
 * missing ffmpeg — youtubei.js cannot recover those cases.
 */
export async function withYoutubeDownloadFallback<T>(
  options: YoutubeDownloadFallbackOptions<T>,
): Promise<T> {
  try {
    return await options.primary();
  } catch (primaryErr) {
    const code = errorCode(primaryErr);
    if (code && SKIP_FALLBACK_CODES.has(code)) {
      throw primaryErr;
    }

    const primaryLabel = options.primaryLabel ?? 'yt-dlp';
    const fallbackLabel = options.fallbackLabel ?? 'youtubei.js';
    const primaryMsg = errorMessage(primaryErr);
    const switchMsg = `${primaryLabel} failed, falling back to ${fallbackLabel}: ${primaryMsg}`;
    options.onLog?.(switchMsg);
    console.warn(`[youtube-download] ${switchMsg}`);

    try {
      return await options.fallback();
    } catch (fallbackErr) {
      const fallbackMsg = errorMessage(fallbackErr);
      throw new AppError(
        `Failed to ${options.action} (${primaryLabel}: ${primaryMsg}; ${fallbackLabel}: ${fallbackMsg})`,
        502,
        'YOUTUBE_DOWNLOAD_FAILED',
      );
    }
  }
}
