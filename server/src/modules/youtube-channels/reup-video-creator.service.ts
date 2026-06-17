import { paths } from '../../config/paths.js';
import { processReupVideo, buildReupOutputPath } from '../../infrastructure/ffmpeg/reup-video-processor.js';
import { downloadYoutubeVideo } from '../../infrastructure/youtube/youtube-video-downloader.js';
import { AppError } from '../../shared/http/errors.js';
import { sourceVideosRepository } from '../source-channels/source-videos.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import type { SourceChannel, SourceVideoRecord } from '../source-channels/source-channels.types.js';
import { reupVideoHistoryRepository } from './reup-video-history.repository.js';
import { REUP_VIDEOS_PER_RUN } from './reup-video.constants.js';
import type {
  CreateReupVideosResult,
  ReupVideoOutputItem,
  ReupVideoTask,
} from './reup-video.types.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from './youtube-channels.types.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

function resolveSourceChannelsFromMapping(sourceMapping: string): SourceChannel[] {
  const urls = sourceMapping
    .split(',')
    .map((part) => normalizeUrl(part))
    .filter(Boolean);

  if (urls.length === 0) return [];

  const urlSet = new Set(urls);
  return sourceChannelsRepository
    .findAll()
    .filter((source) => urlSet.has(normalizeUrl(source.fullUrl)));
}

interface SourceVideoWithSource extends SourceVideoRecord {
  sourceId: string;
}

function collectSourceVideos(sources: SourceChannel[]): SourceVideoWithSource[] {
  const videos: SourceVideoWithSource[] = [];

  for (const source of sources) {
    const store = sourceVideosRepository.read(source.id);
    if (!store?.videos?.length) continue;
    for (const video of store.videos) {
      videos.push({ ...video, sourceId: source.id });
    }
  }

  return videos;
}

function buildTasks(channel: YoutubeChannel, videos: SourceVideoWithSource[]): ReupVideoTask[] {
  const processedUrls = reupVideoHistoryRepository.getProcessedVideoUrls(channel.id);

  return videos
    .filter((video) => video.url && !processedUrls.has(video.url.trim().toLowerCase()))
    .slice(0, REUP_VIDEOS_PER_RUN)
    .map((video) => ({
      link: video.url,
      id: channel.id,
      language: channel.language,
      videoId: video.id,
      sourceId: video.sourceId,
    }));
}

export class ReupVideoCreatorService {
  async createVideos(channelId: string): Promise<CreateReupVideosResult> {
    const channel = youtubeChannelsRepository.findById(channelId);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    if (!isReupChannelType(channel.type)) {
      throw new AppError(
        'Only reup audio or reup video channels can create videos',
        400,
        'INVALID_CHANNEL_TYPE',
      );
    }

    if (!channel.sourceMapping.trim()) {
      throw new AppError('Channel has no source mapping configured', 400, 'NO_SOURCE_MAPPING');
    }

    const sources = resolveSourceChannelsFromMapping(channel.sourceMapping);
    if (sources.length === 0) {
      throw new AppError('No source channels matched source mapping', 400, 'SOURCE_NOT_FOUND');
    }

    const allVideos = collectSourceVideos(sources);
    if (allVideos.length === 0) {
      throw new AppError('No source videos available for mapped sources', 400, 'NO_SOURCE_VIDEOS');
    }

    const tasks = buildTasks(channel, allVideos);
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    const items: ReupVideoOutputItem[] = [];

    for (const task of tasks) {
      const downloadPath = await downloadYoutubeVideo(task.link, paths.reupVideoDownloadsDir);
      const outputPath = buildReupOutputPath(channel.id, task.videoId, paths.reupVideoOutputDir);
      await processReupVideo(downloadPath, outputPath);

      reupVideoHistoryRepository.markProcessed({
        channelId: channel.id,
        videoUrl: task.link,
        videoId: task.videoId,
        outputPath,
        processedAt: new Date().toISOString(),
      });

      items.push({
        link: task.link,
        channelId: channel.id,
        language: channel.language,
        videoId: task.videoId,
        outputPath,
      });
    }

    return { items };
  }
}

export const reupVideoCreatorService = new ReupVideoCreatorService();
