import fs from 'node:fs/promises';
import path from 'node:path';
import { requireYoutubeVideoId } from '../youtube-url.js';
import type { DownloadYoutubeVideoOptions } from '../youtube-video-downloader.js';
import { getYoutubeiClient, toYoutubeiError } from './youtubei-client.js';
import { writeYoutubeiStreamToFile } from './youtubei-stream.js';

const VIDEO_DOWNLOAD_ATTEMPTS = [
  { type: 'video' as const, quality: '720p', format: 'mp4', codec: 'avc', client: 'ANDROID' as const },
  { type: 'video' as const, quality: '720p', format: 'mp4', client: 'ANDROID' as const },
  { type: 'video' as const, quality: 'best', format: 'mp4', codec: 'avc', client: 'ANDROID' as const },
];

export async function downloadYoutubeVideoWithYoutubei(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeVideoOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = requireYoutubeVideoId(url);
  const basename = options?.outputBasename ?? videoId;
  const outPath = path.join(outputDir, `video.mp4`);
  const onLog = options?.onLog;
  let lastError: unknown;

  const yt = await getYoutubeiClient();

  for (let i = 0; i < VIDEO_DOWNLOAD_ATTEMPTS.length; i++) {
    const attempt = VIDEO_DOWNLOAD_ATTEMPTS[i]!;
    await fs.unlink(outPath).catch(() => undefined);

    try {
      const stream = await yt.download(videoId, {
        type: 'video+audio',
        // quality: '1080p',
        client: 'ANDROID',
      });
      await writeYoutubeiStreamToFile(stream, outPath);
      // await fs.access(outPath);

      return outPath;
    } catch (err) {
      lastError = err;
      onLog?.(`youtubei.js video download attempt ${i + 1}/${VIDEO_DOWNLOAD_ATTEMPTS.length} failed, trying next...`);
    }
  }

  throw toYoutubeiError(lastError, 'Failed to download YouTube video');
}
