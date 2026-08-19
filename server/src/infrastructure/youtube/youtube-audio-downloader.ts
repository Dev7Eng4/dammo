import { withYoutubeDownloadFallback } from './youtube-download-fallback.js';
import { requireYoutubeVideoId } from './youtube-url.js';
import { downloadYoutubeAudioWithYtdlp } from './ytdlp/ytdlp-audio-downloader.js';
import { downloadYoutubeAudioWithYoutubei } from './youtubei/youtubei-audio-downloader.js';

export async function downloadYoutubeAudio(url: string, outputDir: string): Promise<string> {
  requireYoutubeVideoId(url);
  return withYoutubeDownloadFallback({
    action: 'download YouTube audio',
    primary: () => downloadYoutubeAudioWithYtdlp(url, outputDir),
    fallback: () => downloadYoutubeAudioWithYoutubei(url, outputDir),
  });
}
