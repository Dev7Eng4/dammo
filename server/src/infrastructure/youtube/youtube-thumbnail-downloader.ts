import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from './youtube-dl-client.js';
import { AppError } from '../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { findFileByPrefix } from './youtube-download-utils.js';
import { requireYoutubeVideoId } from './youtube-url.js';

export interface DownloadYoutubeThumbnailOptions {
  outputBasename?: string;
}

async function fetchThumbnailFromMetadata(
  url: string,
  outputDir: string,
  basename: string,
): Promise<string> {
  const raw = await youtubeDl(url, {
    ...getYoutubeDlCommonOptions(),
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    ignoreErrors: false,
  });

  const data = raw as { thumbnail?: string };
  if (!data.thumbnail) {
    throw new AppError('Thumbnail not found', 404, 'THUMBNAIL_NOT_FOUND');
  }

  const response = await fetch(data.thumbnail);
  if (!response.ok) {
    throw new AppError('Failed to fetch thumbnail image', 502, 'YOUTUBE_DOWNLOAD_FAILED');
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('webp') ? '.webp' : contentType.includes('png') ? '.png' : '.jpg';
  const targetPath = path.join(outputDir, `${basename}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

export async function downloadYoutubeThumbnail(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeThumbnailOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  requireYoutubeVideoId(url);

  const basename = options?.outputBasename?.trim() || 'old-thumbnail';
  const outputTemplate = path.join(outputDir, `${basename}.%(ext)s`);

  try {
    await youtubeDl(url, {
      ...getYoutubeDlCommonOptions(),
      output: outputTemplate,
      skipDownload: true,
      writeThumbnail: true,
      noWarnings: true,
      ignoreErrors: false,
    });

    const match = await findFileByPrefix(outputDir, `${basename}.`);
    if (match) return match;

    return fetchThumbnailFromMetadata(url, outputDir, basename);
  } catch (err) {
    if (err instanceof AppError) throw err;

    try {
      return await fetchThumbnailFromMetadata(url, outputDir, basename);
    } catch (fallbackErr) {
      const detail = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
      throw new AppError(`Failed to download YouTube thumbnail: ${detail}`, 502, 'YOUTUBE_DOWNLOAD_FAILED');
    }
  }
}
