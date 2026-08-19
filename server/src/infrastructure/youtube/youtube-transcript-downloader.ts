import { withYoutubeDownloadFallback } from './youtube-download-fallback.js';
import { requireYoutubeVideoId } from './youtube-url.js';
import { downloadYoutubeTranscriptWithYtdlp } from './ytdlp/ytdlp-transcript-downloader.js';
import { downloadYoutubeTranscriptWithYoutubeTranscriptApi } from './youtube-transcript/youtube-transcript-api-downloader.js';

export type TranscriptLanguage = 'en' | 'ko' | 'ja' | 'es';

export const DEFAULT_TRANSCRIPT_LANGUAGE: TranscriptLanguage = 'ja';

export async function downloadYoutubeTranscript(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<string> {
  requireYoutubeVideoId(url);
  return withYoutubeDownloadFallback({
    action: 'download YouTube transcript',
    primary: () => downloadYoutubeTranscriptWithYtdlp(url, outputDir, language),
    fallback: () => downloadYoutubeTranscriptWithYoutubeTranscriptApi(url, outputDir, language),
    fallbackLabel: 'youtube-transcript',
  });
}
