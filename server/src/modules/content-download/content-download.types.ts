import type { DownloadAssetType, DownloadPlatform } from '../../infrastructure/download/download.types.js';
import type { TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';

export type { DownloadPlatform, DownloadAssetType };
export type { TranscriptLanguage };

export interface DownloadArtifact {
  platform: DownloadPlatform;
  videoId: string;
  assetType: DownloadAssetType;
  language: TranscriptLanguage | null;
  path: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DownloadYoutubeUrlInput {
  url: string;
}

export interface DownloadYoutubeTranscriptInput {
  url: string;
  language?: TranscriptLanguage;
}
