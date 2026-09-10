const PERMANENT_ACCESS_PATTERNS = [
  'private video',
  'login required',
  'members only',
  'member-only',
  'video unavailable',
  'this video is private',
  'this video is unavailable',
  'sign in to confirm your age',
] as const;

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return String(err);
}

/**
 * True when the download failed for an access/availability reason that will not
 * improve with retries or an alternate downloader (e.g. Private video).
 */
export function isYoutubePermanentAccessError(err: unknown): boolean {
  const lower = errorMessage(err).toLowerCase();
  return PERMANENT_ACCESS_PATTERNS.some(pattern => lower.includes(pattern));
}
