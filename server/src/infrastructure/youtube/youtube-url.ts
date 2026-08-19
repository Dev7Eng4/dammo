import { AppError } from '../../shared/http/errors.js';

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
    if (shortsMatch?.[1]) return shortsMatch[1];
    const embedMatch = parsed.pathname.match(/\/embed\/([^/]+)/);
    if (embedMatch?.[1]) return embedMatch[1];
    return null;
  } catch {
    return null;
  }
}

export function requireYoutubeVideoId(url: string): string {
  console.log('🚀 ~ requireYoutubeVideoId ~ url:', url);
  const videoId = extractYoutubeVideoId(url);
  console.log('🚀 ~ requireYoutubeVideoId ~ videoId:', videoId);
  if (!videoId) {
    throw new AppError('Invalid YouTube video URL', 400, 'INVALID_VIDEO_URL');
  }
  return videoId;
}
