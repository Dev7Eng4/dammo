import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from 'youtube-dl-exec';
import { resolveFfmpegLocation } from '../ffmpeg/ffmpeg-location.js';
import { AppError } from '../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { findFileByPrefix } from './youtube-download-utils.js';
import { requireYoutubeVideoId } from './youtube-url.js';

export async function downloadYoutubeAudio(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  requireYoutubeVideoId(url);

  const outputTemplate = path.join(outputDir, 'audio.%(ext)s');
  const expectedMp3 = path.join(outputDir, 'audio.mp3');

  try {
    const ffmpegLocation = resolveFfmpegLocation();

    await youtubeDl(url, {
      ...getYoutubeDlCommonOptions(),
      output: outputTemplate,
      format: 'bestaudio/best',
      extractAudio: true,
      audioFormat: 'mp3',
      ffmpegLocation,
      noWarnings: true,
      ignoreErrors: false,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ffmpeg not found')) {
      throw new AppError(err.message, 500, 'FFMPEG_NOT_FOUND');
    }
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Failed to download YouTube audio: ${detail}`, 502, 'YOUTUBE_DOWNLOAD_FAILED');
  }

  try {
    await fs.access(expectedMp3);
    return expectedMp3;
  } catch {
    const match = await findFileByPrefix(outputDir, 'audio.');
    if (!match) {
      throw new AppError('Downloaded audio file not found', 502, 'YOUTUBE_DOWNLOAD_FAILED');
    }
    return match;
  }
}
