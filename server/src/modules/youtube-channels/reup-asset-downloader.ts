import { mediaDownloadDir } from '../../config/paths.js';
import { cleanSrt } from '../../infrastructure/subtitle/clean-srt.js';
import { downloadYoutubeAudio } from '../../infrastructure/youtube/youtube-audio-downloader.js';
import { downloadYoutubeThumbnail } from '../../infrastructure/youtube/youtube-thumbnail-downloader.js';
import { downloadYoutubeTranscript, type TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadYoutubeVideo } from '../../infrastructure/youtube/youtube-video-downloader.js';
import { requireYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import type { ChannelLanguage, StoredYoutubeChannelType } from './youtube-channels.types.js';
import { updateTranscriptWithLlm } from './reup-transcript-updater.js';

export interface ReupAudioDownloadResult {
  youtubeVideoId: string;
  outputDir: string;
  thumbnailPath: string;
  audioPath: string;
  transcriptPath: string;
}

export interface ReupTranscriptProcessResult {
  srtPath?: string;
  updatedSrtPath?: string;
}

export interface ReupDownloadResult {
  youtubeVideoId: string;
  outputDir: string;
  primaryPath: string;
  videoPath?: string;
  audioPath?: string;
  thumbnailPath?: string;
  transcriptPath?: string;
  srtPath?: string;
  updatedSrtPath?: string;
}

function isReupAudioChannel(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio';
}

export async function downloadReupAudioAssets(url: string, language: ChannelLanguage): Promise<ReupAudioDownloadResult> {
  const youtubeVideoId = requireYoutubeVideoId(url);
  const outputDir = mediaDownloadDir('youtube', youtubeVideoId);
  const transcriptLanguage = language as TranscriptLanguage;
  // const thumbnailPath = await downloadYoutubeThumbnail(url, outputDir);
  const audioPath = await downloadYoutubeAudio(url, outputDir);
  const transcriptPath = await downloadYoutubeTranscript(url, outputDir, transcriptLanguage);

  return {
    youtubeVideoId,
    outputDir,
    thumbnailPath: '',
    audioPath,
    transcriptPath,
  };
}

export async function processReupAudioTranscript(transcriptPath: string, language: ChannelLanguage): Promise<ReupTranscriptProcessResult> {
  const srtPath = await cleanSrt(transcriptPath);

  if (language !== 'ja') {
    return { srtPath };
  }

  const updatedSrtPath = await updateTranscriptWithLlm(srtPath, language as TranscriptLanguage);
  return { updatedSrtPath };
}

export async function downloadReupAssets(
  url: string,
  channelType: StoredYoutubeChannelType,
  language: ChannelLanguage,
): Promise<ReupDownloadResult> {
  const youtubeVideoId = requireYoutubeVideoId(url);
  const outputDir = mediaDownloadDir('youtube', youtubeVideoId);

  if (isReupAudioChannel(channelType)) {
    const downloaded = await downloadReupAudioAssets(url, language);
    const processed = await processReupAudioTranscript(downloaded.transcriptPath, language);

    return {
      youtubeVideoId,
      outputDir,
      primaryPath: downloaded.audioPath,
      thumbnailPath: downloaded.thumbnailPath,
      audioPath: downloaded.audioPath,
      ...(processed.updatedSrtPath
        ? { updatedSrtPath: processed.updatedSrtPath }
        : { transcriptPath: downloaded.transcriptPath, srtPath: processed.srtPath }),
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
