import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from './youtube-dl-client.js';
import { AppError } from '../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { findFileByPrefix } from './youtube-download-utils.js';
import { toYoutubeDlError } from './youtube-dl-error.js';
import { requireYoutubeVideoId } from './youtube-url.js';

export type YoutubeVideoQuality = 'hd' | 'best';

const HD_FORMAT = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
const BEST_FORMAT = 'mp4/best[ext=mp4]/best';

function resolveFormat(quality: YoutubeVideoQuality): string {
  return quality === 'hd' ? HD_FORMAT : BEST_FORMAT;
}

export async function downloadYoutubeVideo(
  url: string,
  outputDir: string,
  options?: { quality?: YoutubeVideoQuality; outputBasename?: string },
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = requireYoutubeVideoId(url);
  const quality = options?.quality ?? 'best';
  const basename = options?.outputBasename ?? videoId;
  const outputTemplate = path.join(outputDir, `${basename}.%(ext)s`);
  const expectedMp4 = path.join(outputDir, `${basename}.mp4`);

  try {
    await youtubeDl(url, {
      ...getYoutubeDlCommonOptions(),
      output: outputTemplate,
      format: resolveFormat(quality),
      mergeOutputFormat: 'mp4',
      noWarnings: true,
      ignoreErrors: false,
    });
  } catch (err) {
    throw toYoutubeDlError(err, 'Failed to download YouTube video');
  }

  try {
    await fs.access(expectedMp4);
    return expectedMp4;
  } catch {
    const match = await findFileByPrefix(outputDir, `${basename}.`);
    if (!match) {
      throw new AppError('Downloaded video file not found', 502, 'YOUTUBE_DOWNLOAD_FAILED');
    }
    return match;
  }
}
