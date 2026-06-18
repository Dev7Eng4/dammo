import { mediaDownloadDir } from '../../config/paths.js';
import { cleanSrt } from '../../infrastructure/subtitle/clean-srt.js';
import { downloadYoutubeAudio } from '../../infrastructure/youtube/youtube-audio-downloader.js';
import {
  downloadYoutubeTranscript,
  type TranscriptLanguage,
} from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadYoutubeVideo } from '../../infrastructure/youtube/youtube-video-downloader.js';
import { requireYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import type { ChannelLanguage, StoredYoutubeChannelType } from './youtube-channels.types.js';

export interface ReupDownloadResult {
  youtubeVideoId: string;
  outputDir: string;
  primaryPath: string;
  videoPath?: string;
  audioPath?: string;
  transcriptPath?: string;
  srtPath?: string;
}

function isReupAudioChannel(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio';
}

export async function downloadReupAssets(
  url: string,
  channelType: StoredYoutubeChannelType,
  language: ChannelLanguage,
): Promise<ReupDownloadResult> {
  const youtubeVideoId = requireYoutubeVideoId(url);
  const outputDir = mediaDownloadDir('youtube', youtubeVideoId);

  if (isReupAudioChannel(channelType)) {
    const transcriptLanguage = language as TranscriptLanguage;
    const [audioPath, transcriptPath] = await Promise.all([
      downloadYoutubeAudio(url, outputDir),
      downloadYoutubeTranscript(url, outputDir, transcriptLanguage),
    ]);
    const srtPath = await cleanSrt(transcriptPath);

    return {
      youtubeVideoId,
      outputDir,
      primaryPath: audioPath,
      audioPath,
      transcriptPath,
      srtPath,
    };
  }

  const videoPath = await downloadYoutubeVideo(url, outputDir, {
    quality: 'best',
    outputBasename: 'video',
  });

  return {
    youtubeVideoId,
    outputDir,
    primaryPath: videoPath,
    videoPath,
  };
}
