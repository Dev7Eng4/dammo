import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir } from '../../../../config/paths.js';
import { cleanSrt } from '../../../../infrastructure/subtitle/clean-srt.js';
import { downloadYoutubeAudio } from '../../../../infrastructure/youtube/youtube-audio-downloader.js';
import { downloadYoutubeThumbnail } from '../../../../infrastructure/youtube/youtube-thumbnail-downloader.js';
import { downloadYoutubeTranscript, type TranscriptLanguage } from '../../../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadYoutubeVideo } from '../../../../infrastructure/youtube/youtube-video-downloader.js';
import { requireYoutubeVideoId } from '../../../../infrastructure/youtube/youtube-url.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { StoredYoutubeChannelType } from '../../../youtube-channels/youtube-channels.types.js';
import { updateTranscriptWithLlm } from './transcript-updater.js';

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

async function downloadDirectThumbnail(youtubeVideoId: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, 'old-thumbnail.jpg');
  
  // Try maxresdefault first
  let response = await fetch(`https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`);
  
  // Fallback to hqdefault if not found or empty
  if (!response.ok) {
    response = await fetch(`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to fetch thumbnail for video ${youtubeVideoId}`);
  }
  
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

function isReupAudioChannel(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio';
}

export async function downloadSourceAudioAssets(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<ReupAudioDownloadResult> {
  const youtubeVideoId = requireYoutubeVideoId(url);
  const thumbnailPath = await downloadDirectThumbnail(youtubeVideoId, outputDir);
  const audioPath = await downloadYoutubeAudio(url, outputDir);
  const transcriptPath = await downloadYoutubeTranscript(url, outputDir, language);

  return {
    youtubeVideoId,
    outputDir,
    thumbnailPath,
    audioPath,
    transcriptPath,
  };
}

export async function downloadReupAudioAssets(url: string, language: ChannelLanguage): Promise<ReupAudioDownloadResult> {
  const youtubeVideoId = requireYoutubeVideoId(url);
  const outputDir = mediaDownloadDir('youtube', youtubeVideoId);
  return downloadSourceAudioAssets(url, outputDir, language as TranscriptLanguage);
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
