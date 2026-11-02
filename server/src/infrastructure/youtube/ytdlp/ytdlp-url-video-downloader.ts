import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from '../youtube-dl-client.js';
import { resolveFfmpegLocation } from '../../ffmpeg/ffmpeg-location.js';
import { AppError } from '../../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from '../youtube-dl-auth.js';
import { findFileByPrefix } from '../youtube-download-utils.js';
import { toYoutubeDlError } from '../youtube-dl-error.js';

/** Prefer MP4 streams; fall back to anything yt-dlp can merge into MP4. */
const URL_VIDEO_FORMAT = 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b';

/**
 * Download a single video from any URL yt-dlp supports (YouTube, TikTok, direct .mp4 links, ...)
 * into `outputDir` as `{basename}.mp4`.
 */
export async function downloadVideoFromUrlWithYtdlp(
  url: string,
  outputDir: string,
  basename: string,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${basename}.mp4`);

  try {
    await youtubeDl(url, {
      ...getYoutubeDlCommonOptions(),
      format: URL_VIDEO_FORMAT,
      mergeOutputFormat: 'mp4',
      ffmpegLocation: resolveFfmpegLocation(),
      output: path.join(outputDir, `${basename}.%(ext)s`),
      noPlaylist: true,
      noWarnings: true,
      ignoreErrors: false,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ffmpeg not found')) {
      throw new AppError(err.message, 500, 'FFMPEG_NOT_FOUND');
    }
    throw toYoutubeDlError(err, 'Failed to download video');
  }

  try {
    await fs.access(outPath);
    return outPath;
  } catch {
    const match = await findFileByPrefix(outputDir, `${basename}.`);
    if (!match) {
      throw new AppError('Downloaded video file not found', 502, 'VIDEO_DOWNLOAD_FAILED');
    }
    return match;
  }
}
