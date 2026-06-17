import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from 'youtube-dl-exec';
import { AppError } from '../../shared/http/errors.js';

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v) return v;
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
    if (shortsMatch?.[1]) return shortsMatch[1];
    return null;
  } catch {
    return null;
  }
}

export async function downloadYoutubeVideo(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new AppError('Invalid YouTube video URL', 400, 'INVALID_VIDEO_URL');
  }

  const outputTemplate = path.join(outputDir, `${videoId}.%(ext)s`);
  const expectedMp4 = path.join(outputDir, `${videoId}.mp4`);

  try {
    await youtubeDl(url, {
      output: outputTemplate,
      format: 'mp4/best[ext=mp4]/best',
      mergeOutputFormat: 'mp4',
      noWarnings: true,
      ignoreErrors: false,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Failed to download YouTube video: ${detail}`, 502, 'YOUTUBE_DOWNLOAD_FAILED');
  }

  try {
    await fs.access(expectedMp4);
    return expectedMp4;
  } catch {
    const files = await fs.readdir(outputDir);
    const match = files.find((file) => file.startsWith(`${videoId}.`));
    if (!match) {
      throw new AppError('Downloaded video file not found', 502, 'YOUTUBE_DOWNLOAD_FAILED');
    }
    return path.join(outputDir, match);
  }
}
