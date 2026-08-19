import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from '../youtube-dl-client.js';
import { getYoutubeDlCommonOptions } from '../youtube-dl-auth.js';
import { requireYoutubeVideoId } from '../youtube-url.js';
import {
  YOUTUBE_VIDEO_DOWNLOAD_FORMAT_LABELS,
  YOUTUBE_VIDEO_DOWNLOAD_FORMATS,
} from '../youtube-download.constants.js';
import { withYoutubeDownloadRetries } from '../youtube-download-retry.js';
import { toYoutubeDlError } from '../youtube-dl-error.js';
import type { DownloadYoutubeVideoOptions } from '../youtube-video-downloader.js';

async function downloadYoutubeVideoOnce(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeVideoOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = requireYoutubeVideoId(url);
  const basename = options?.outputBasename ?? videoId;
  const formats = options?.formats ?? YOUTUBE_VIDEO_DOWNLOAD_FORMATS;
  const outPath = path.join(outputDir, `${basename}.mp4`);
  const onLog = options?.onLog;
  let lastError: unknown;

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i]!;
    await fs.unlink(outPath).catch(() => undefined);

    try {
      await youtubeDl(url, {
        ...getYoutubeDlCommonOptions(),
        format,
        output: outPath,
        noWarnings: true,
        ignoreErrors: false,
      });
      await fs.access(outPath);
      const formatLabel = YOUTUBE_VIDEO_DOWNLOAD_FORMAT_LABELS[i] ?? format;
      onLog?.(`YouTube video download succeeded with format ${i + 1}/${formats.length} (${formatLabel})`);
      return outPath;
    } catch (err) {
      lastError = err;
      onLog?.(`YouTube video download format ${i + 1}/${formats.length} failed, trying next...`);
    }
  }

  throw toYoutubeDlError(lastError, 'Failed to download YouTube video');
}

export async function downloadYoutubeVideoWithYtdlp(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeVideoOptions,
): Promise<string> {
  return withYoutubeDownloadRetries(() => downloadYoutubeVideoOnce(url, outputDir, options), {
    onRetry: ({ attempt, maxAttempts, delayMs, reason }) => {
      options?.onLog?.(
        `Download failed (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delayMs / 1000)}s: ${reason}`,
      );
    },
  });
}
