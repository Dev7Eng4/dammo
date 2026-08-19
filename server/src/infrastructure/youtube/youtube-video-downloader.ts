import { requireYoutubeVideoId } from './youtube-url.js';
import { downloadYoutubeVideoWithYtdlp } from './ytdlp/ytdlp-video-downloader.js';

export interface DownloadYoutubeVideoOptions {
  outputBasename?: string;
  formats?: readonly string[];
  onLog?: (msg: string) => void;
}

export async function downloadYoutubeVideo(
  url: string,
  outputDir: string,
  options?: DownloadYoutubeVideoOptions,
): Promise<string> {
  requireYoutubeVideoId(url);
  return downloadYoutubeVideoWithYtdlp(url, outputDir, options);
}
