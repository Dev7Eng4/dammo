import type { TranscriptLanguage } from '../youtube/youtube-transcript-downloader.js';

export type DownloadPlatform = 'youtube' | 'tiktok' | 'facebook';

export type DownloadAssetType = 'video' | 'audio' | 'transcript' | 'thumbnail';

export interface PlatformDownloader {
  downloadVideo(url: string, outputDir: string): Promise<string>;
  downloadAudio(url: string, outputDir: string): Promise<string>;
  downloadTranscript(url: string, outputDir: string, language: TranscriptLanguage): Promise<string>;
  downloadThumbnail(url: string, outputDir: string): Promise<string>;
}
