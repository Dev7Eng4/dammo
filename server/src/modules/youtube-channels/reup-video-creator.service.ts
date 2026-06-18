import { AppError } from '../../shared/http/errors.js';
import { canonicalizeSourceUrl } from '../../shared/platform/url-parser.js';
import { sourceVideosRepository } from '../source-channels/source-videos.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import type { SourceChannel, SourceVideoRecord } from '../source-channels/source-channels.types.js';
import { downloadReupAssets } from './reup-asset-downloader.js';
import { reupVideoHistoryRepository } from './reup-video-history.repository.js';
import { REUP_VIDEOS_PER_RUN } from './reup-video.constants.js';
import type {
  CreateReupVideosResult,
  ReupVideoOutputItem,
  ReupVideoTask,
} from './reup-video.types.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from './youtube-channels.types.js';
import { taskQueueRepository } from '../task-queue/task-queue.repository.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';

interface CreateVideosOptions {
  taskJobId?: string;
}

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function isReupAudioChannel(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio';
}

function resolveSourceChannelsFromMapping(sourceMapping: string): SourceChannel[] {
  const urls = sourceMapping
    .split(',')
    .map((part) => canonicalizeSourceUrl(part))
    .filter(Boolean);

  if (urls.length === 0) return [];

  const urlSet = new Set(urls);
  return sourceChannelsRepository
    .findAll()
    .filter((source) => urlSet.has(canonicalizeSourceUrl(source.fullUrl)));
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
  async createVideos(channelId: string, options?: CreateVideosOptions): Promise<CreateReupVideosResult> {
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
    const isAudioChannel = isReupAudioChannel(channel.type);

    for (const task of tasks) {
      const taskJobId = options?.taskJobId;

      try {
        if (taskJobId) {
          taskQueueRepository.setLivePhase(taskJobId, 'downloading');
          taskQueueRepository.appendLogMessage(
            taskJobId,
            'info',
            isAudioChannel
              ? `Downloading audio + transcript (${task.language}) for source video ${task.videoId}...`
              : `Downloading source video ${task.videoId}...`,
          );
        }

        const downloaded = await downloadReupAssets(task.link, channel.type, channel.language);

        if (taskJobId) {
          if (isAudioChannel) {
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'ok',
              `Audio saved → ${downloaded.audioPath}`,
            );
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'ok',
              `Transcript saved → ${downloaded.transcriptPath}`,
            );
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'ok',
              `SRT cleaned → ${downloaded.srtPath}`,
            );
          } else {
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'ok',
              `Video saved → ${downloaded.videoPath}`,
            );
          }
        }

        reupVideoHistoryRepository.markProcessed({
          channelId: channel.id,
          videoUrl: task.link,
          videoId: task.videoId,
          outputPath: downloaded.primaryPath,
          processedAt: new Date().toISOString(),
        });

        items.push({
          link: task.link,
          channelId: channel.id,
          language: channel.language,
          videoId: task.videoId,
          youtubeVideoId: downloaded.youtubeVideoId,
          outputPath: downloaded.primaryPath,
          ...(downloaded.audioPath ? { audioPath: downloaded.audioPath } : {}),
          ...(downloaded.transcriptPath ? { transcriptPath: downloaded.transcriptPath } : {}),
          ...(downloaded.srtPath ? { srtPath: downloaded.srtPath } : {}),
          ...(downloaded.videoPath ? { videoPath: downloaded.videoPath } : {}),
        });
      } catch (err) {
        if (taskJobId) {
          const message =
            err instanceof AppError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Video processing failed';
          taskQueueRepository.appendLogMessage(taskJobId, 'err', message);
        }
        throw err;
      }
    }

    if (options?.taskJobId) {
      taskQueueRepository.setLivePhase(options.taskJobId, 'done');
    }

    return { items };
  }
}

export const reupVideoCreatorService = new ReupVideoCreatorService();
