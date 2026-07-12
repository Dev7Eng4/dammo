import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

type ExecaLikeError = {
  message?: unknown;
  shortMessage?: unknown;
  stderr?: unknown;
  stdout?: unknown;
  code?: unknown;
};

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function isMissingBinaryError(err: ExecaLikeError, detail: string): boolean {
  if (asString(err.code) === 'ENOENT') return true;
  const haystack = detail.toLowerCase();
  return haystack.includes('enoent') || haystack.includes('yt-dlp');
}

/**
 * yt-dlp errors surface useful text in stderr/shortMessage rather than `message`
 * (which is often empty when the binary itself cannot be spawned). This picks
 * the most descriptive available field.
 */
function extractDetail(err: ExecaLikeError): string {
  return (
    asString(err.stderr) ||
    asString(err.shortMessage) ||
    asString(err.message) ||
    asString(err.stdout) ||
    'Unknown error'
  );
}

/**
 * Normalizes a caught yt-dlp/youtube-dl-exec error into an AppError with a
 * descriptive message. Detects the common "binary missing" case (empty output
 * caused by an ENOENT when spawning yt-dlp).
 */
export function toYoutubeDlError(err: unknown, action: string): AppError {
  const execErr = (err ?? {}) as ExecaLikeError;
  const detail = extractDetail(execErr);

  if (isMissingBinaryError(execErr, detail)) {
    return new AppError(
      `${action}: yt-dlp binary not found. Place yt-dlp at "${env.ytDlpPath}" (or set YT_DLP_PATH), or run "node node_modules/youtube-dl-exec/scripts/postinstall.js" in the server directory to download the bundled binary.`,
      500,
      'YTDLP_BINARY_MISSING',
    );
  }

  return new AppError(`${action}: ${detail}`, 502, 'YOUTUBE_DOWNLOAD_FAILED');
}
