import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir, paths } from '../../config/paths.js';
import { getPlatformDownloader } from '../../infrastructure/download/download-platform.registry.js';
import type { DownloadAssetType, DownloadPlatform } from '../../infrastructure/download/download.types.js';
import { extractYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import { DEFAULT_TRANSCRIPT_LANGUAGE } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { AppError } from '../../shared/http/errors.js';
import type {
  DownloadArtifact,
  DownloadYoutubeTranscriptInput,
  DownloadYoutubeUrlInput,
  TranscriptLanguage,
} from './content-download.types.js';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

async function buildArtifact(
  platform: DownloadPlatform,
  videoId: string,
  assetType: DownloadAssetType,
  filePath: string,
  language: TranscriptLanguage | null,
): Promise<DownloadArtifact> {
  const stat = await fs.stat(filePath);
  const relativePath = path.relative(paths.dataDir, filePath).split(path.sep).join('/');

  return {
    platform,
    videoId,
    assetType,
    language,
    path: filePath,
    relativePath,
    filename: path.basename(filePath),
    mimeType: resolveMimeType(filePath),
    sizeBytes: stat.size,
  };
}

function resolveYoutubeVideoId(url: string): string {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new AppError('Invalid YouTube video URL', 400, 'INVALID_VIDEO_URL');
  }
  return videoId;
}

export class ContentDownloadService {
  private resolveOutputDir(platform: DownloadPlatform, mediaId: string): string {
    return mediaDownloadDir(platform, mediaId);
  }

  async downloadYoutubeVideo(input: DownloadYoutubeUrlInput): Promise<DownloadArtifact> {
    const platform: DownloadPlatform = 'youtube';
    const videoId = resolveYoutubeVideoId(input.url);
    const outputDir = this.resolveOutputDir(platform, videoId);
    const downloader = getPlatformDownloader(platform);
    const filePath = await downloader.downloadVideo(input.url, outputDir);
    return buildArtifact(platform, videoId, 'video', filePath, null);
  }

  async downloadYoutubeAudio(input: DownloadYoutubeUrlInput): Promise<DownloadArtifact> {
    const platform: DownloadPlatform = 'youtube';
    const videoId = resolveYoutubeVideoId(input.url);
    const outputDir = this.resolveOutputDir(platform, videoId);
    const downloader = getPlatformDownloader(platform);
    const filePath = await downloader.downloadAudio(input.url, outputDir);
    return buildArtifact(platform, videoId, 'audio', filePath, null);
  }

  async downloadYoutubeTranscript(input: DownloadYoutubeTranscriptInput): Promise<DownloadArtifact> {
    const platform: DownloadPlatform = 'youtube';
    const videoId = resolveYoutubeVideoId(input.url);
    const language = input.language ?? DEFAULT_TRANSCRIPT_LANGUAGE;
    const outputDir = this.resolveOutputDir(platform, videoId);
    const downloader = getPlatformDownloader(platform);
    const filePath = await downloader.downloadTranscript(input.url, outputDir, language);
    return buildArtifact(platform, videoId, 'transcript', filePath, language);
  }

  async downloadYoutubeThumbnail(input: DownloadYoutubeUrlInput): Promise<DownloadArtifact> {
    const platform: DownloadPlatform = 'youtube';
    const videoId = resolveYoutubeVideoId(input.url);
    const outputDir = this.resolveOutputDir(platform, videoId);
    const downloader = getPlatformDownloader(platform);
    const filePath = await downloader.downloadThumbnail(input.url, outputDir);
    return buildArtifact(platform, videoId, 'thumbnail', filePath, null);
  }
}

export const contentDownloadService = new ContentDownloadService();
