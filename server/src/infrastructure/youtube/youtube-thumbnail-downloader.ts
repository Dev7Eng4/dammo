import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { requireYoutubeVideoId } from './youtube-url.js';

export interface DownloadYoutubeThumbnailOptions {
  outputBasename?: string;
}

const MAXRES_PLACEHOLDER_MAX_BYTES = 5 * 1024;

const THUMBNAIL_VARIANTS = ['maxresdefault', 'hqdefault'] as const;

function buildThumbnailUrl(videoId: string, variant: (typeof THUMBNAIL_VARIANTS)[number]): string {
  return `https://i.ytimg.com/vi/${videoId}/${variant}.jpg`;
}

function isLikelyMaxresPlaceholder(variant: string, buffer: Buffer): boolean {
  return variant === 'maxresdefault' && buffer.byteLength < MAXRES_PLACEHOLDER_MAX_BYTES;
}

async function fetchThumbnailVariant(
  videoId: string,
  variant: (typeof THUMBNAIL_VARIANTS)[number],
): Promise<Buffer | null> {
  const response = await fetch(buildThumbnailUrl(videoId, variant));
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0 || isLikelyMaxresPlaceholder(variant, buffer)) {
    return null;
  }

  return buffer;
}

export async function downloadYoutubeThumbnail(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeThumbnailOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = requireYoutubeVideoId(url);
  const basename = options?.outputBasename?.trim() || 'old-thumbnail';
  const targetPath = path.join(outputDir, `${basename}.jpg`);

  for (const variant of THUMBNAIL_VARIANTS) {
    const buffer = await fetchThumbnailVariant(videoId, variant);
    if (!buffer) continue;

    await fs.writeFile(targetPath, buffer);
    return targetPath;
  }

  throw new AppError('Failed to download YouTube thumbnail', 502, 'YOUTUBE_DOWNLOAD_FAILED');
}
