import { AppError } from '../../shared/http/errors.js';
import { downloadYoutubeAudio } from '../youtube/youtube-audio-downloader.js';
import { downloadYoutubeThumbnail } from '../youtube/youtube-thumbnail-downloader.js';
import {
  downloadYoutubeTranscript,
  type TranscriptLanguage,
} from '../youtube/youtube-transcript-downloader.js';
import { downloadYoutubeVideo } from '../youtube/youtube-video-downloader.js';
import type { DownloadPlatform, PlatformDownloader } from './download.types.js';

const youtubeDownloader: PlatformDownloader = {
  downloadVideo(url, outputDir) {
    return downloadYoutubeVideo(url, outputDir, { quality: 'hd', outputBasename: 'video' });
  },
  downloadAudio: downloadYoutubeAudio,
  downloadTranscript(url, outputDir, language) {
    return downloadYoutubeTranscript(url, outputDir, language as TranscriptLanguage);
  },
  downloadThumbnail: downloadYoutubeThumbnail,
};

const downloaders: Partial<Record<DownloadPlatform, PlatformDownloader>> = {
  youtube: youtubeDownloader,
};

export function getPlatformDownloader(platform: DownloadPlatform): PlatformDownloader {
  const downloader = downloaders[platform];
  if (!downloader) {
    throw new AppError(`Platform "${platform}" is not supported yet`, 400, 'UNSUPPORTED_PLATFORM');
  }
  return downloader;
}
