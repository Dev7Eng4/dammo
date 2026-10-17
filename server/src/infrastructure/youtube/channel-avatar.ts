import type { YtdlpChannelThumbnail } from './youtube-channel.types.js';

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Picks the channel avatar from yt-dlp's `thumbnails`. The top-level `thumbnail` can be the banner,
 * so it is not used. Preference: the `avatar_uncropped` entry, then any square image (avatars are
 * square, banners are ~6:1), preferring the largest.
 */
export function pickChannelAvatarUrl(thumbnails: YtdlpChannelThumbnail[] | undefined): string | undefined {
  if (!Array.isArray(thumbnails)) return undefined;

  const usable = thumbnails.filter(
    (thumbnail): thumbnail is YtdlpChannelThumbnail & { url: string } =>
      thumbnail !== null && typeof thumbnail === 'object' && isHttpUrl(thumbnail.url),
  );

  const uncropped = usable.find(thumbnail => thumbnail.id === 'avatar_uncropped');
  if (uncropped) return uncropped.url.trim();

  const square = usable
    .filter(
      thumbnail =>
        typeof thumbnail.width === 'number' &&
        typeof thumbnail.height === 'number' &&
        thumbnail.width > 0 &&
        thumbnail.width === thumbnail.height,
    )
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  return square[0]?.url.trim();
}
