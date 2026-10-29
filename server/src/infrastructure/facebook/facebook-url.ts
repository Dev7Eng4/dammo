import { AppError } from '../../shared/http/errors.js';

const VIDEO_ID_PATTERNS = [
  /facebook\.com\/(?:[^/?#]+\/)?reel\/(\d+)/i,
  /facebook\.com\/(?:[^/?#]+\/)?videos\/(?:[^/?#]+\/)?(\d+)/i,
  /facebook\.com\/watch\/?\?(?:[^#]*&)?v=(\d+)/i,
  /fb\.watch\/([\w-]+)/i,
];

/** Numeric video id of a Facebook reel / video URL, or null when the URL is not recognised. */
export function extractFacebookVideoId(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) return match[1];
  }
  return /^\d{8,}$/.test(trimmed) ? trimmed : null;
}

export function requireFacebookVideoId(url: string): string {
  const id = extractFacebookVideoId(url);
  if (!id || !/^\d+$/.test(id)) {
    throw new AppError('Invalid Facebook reel URL', 400, 'INVALID_VIDEO_URL');
  }
  return id;
}
