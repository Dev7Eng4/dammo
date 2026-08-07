import { AppError } from '../../shared/http/errors.js';
import { taskQueueRepository } from '../task-queue/task-queue.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { createYoutubeProductionDestination } from './adapters/youtube-production-destination.adapter.js';
import { reupAudioPipeline } from './pipelines/reup-audio/reup-audio.pipeline.js';
import type {
  CreateReupVideosBatchResult,
  CreateReupVideosResult,
  ReupVideoBatchChannelResult,
  ReupVideoOutputItem,
} from './pipelines/reup-audio/reup-audio.types.js';
import type { ProductionPipelineType } from './ports/production-destination.port.js';

interface CreateVideosOptions {
  taskJobId?: string;
  skipLivePhaseDone?: boolean;
  /** Khi true: bỏ qua bước assembleReupSiVideo, video sẽ ở status Prepared */
  skipVideoAssembly?: boolean;
  /** Số video tối đa xử lý trên mỗi channel trong một lần chạy */
  maxVideosPerChannel?: number;
  /** Danh sách source video ID cụ thể cần xử lý (bỏ qua auto-pick) */
  videoIds?: string[];
}

const SKIP_ON_CREATE_CODES = new Set(['NO_SOURCE_MAPPING', 'SOURCE_NOT_FOUND', 'NO_SOURCE_VIDEOS', 'NO_UNPROCESSED_VIDEOS']);

function isReupChannelType(type: string): type is ProductionPipelineType {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function isSkippableCreateError(err: unknown): err is AppError {
  return err instanceof AppError && Boolean(err.code && SKIP_ON_CREATE_CODES.has(err.code));
}

function resolvePipeline(pipelineType: ProductionPipelineType) {
  if (pipelineType === 'reup_audio' || pipelineType === 'reup' || pipelineType === 'reup_video') {
    return reupAudioPipeline;
  }

  throw new AppError(`Unsupported production pipeline: ${pipelineType}`, 400, 'INVALID_CHANNEL_TYPE');
}

export class VideoProductionService {
  async createVideosForYoutubeChannel(channelId: string, options?: CreateVideosOptions): Promise<CreateReupVideosResult> {
    const channel = youtubeChannelsRepository.findById(channelId);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    if (!isReupChannelType(channel.type)) {
      throw new AppError('Only reup audio or reup video channels can create videos', 400, 'INVALID_CHANNEL_TYPE');
    }

    const destination = await createYoutubeProductionDestination(channel);
    return resolvePipeline(destination.pipelineType).run(destination, options);
  }

  async prepareVideosForYoutubeChannel(channelId: string, options?: CreateVideosOptions): Promise<CreateReupVideosResult> {
    return this.createVideosForYoutubeChannel(channelId, { ...options, skipVideoAssembly: true });
  }

  async createVideosForChannels(channelIds: string[], options?: CreateVideosOptions): Promise<CreateReupVideosBatchResult> {
    if (channelIds.length === 0) {
      throw new AppError('No channels specified', 400, 'NO_CHANNELS');
    }

    const taskJobId = options?.taskJobId;
    const channels: ReupVideoBatchChannelResult[] = [];
    const items: ReupVideoOutputItem[] = [];
    const total = channelIds.length;

    for (let index = 0; index < channelIds.length; index++) {
      const channelId = channelIds[index];
      const position = index + 1;
      const channel = youtubeChannelsRepository.findById(channelId);

      if (!channel) {
        channels.push({
          channelId,
          channelName: channelId,
          status: 'skipped',
          reason: 'Channel not found',
        });

        if (taskJobId) {
          taskQueueRepository.appendLogMessage(taskJobId, 'info', `Skipped unknown channel: ${channelId}`);
        }
        continue;
      }

      if (!isReupChannelType(channel.type)) {
        channels.push({
          channelId: channel.id,
          channelName: channel.name,
          status: 'skipped',
          reason: 'Only reup audio or reup video channels can create videos',
        });

        if (taskJobId) {
          taskQueueRepository.appendLogMessage(taskJobId, 'info', `Skipped ${channel.name}: not a reup channel`);
        }
        continue;
      }

      if (taskJobId) {
        taskQueueRepository.appendLogMessage(taskJobId, 'info', `Processing channel ${position}/${total}: ${channel.name}`);
      }

      try {
        const result = await this.createVideosForYoutubeChannel(channel.id, {
          ...options,
          skipLivePhaseDone: true,
        });

        channels.push({
          channelId: channel.id,
          channelName: channel.name,
          status: 'created',
          items: result.items,
        });
        items.push(...result.items);

        if (taskJobId) {
          taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Created video for ${channel.name} (${result.items.length} item(s))`);
        }
      } catch (err) {
        if (isSkippableCreateError(err)) {
          channels.push({
            channelId: channel.id,
            channelName: channel.name,
            status: 'skipped',
            reason: err.message,
          });

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'info', `Skipped ${channel.name}: ${err.message}`);
          }
          continue;
        }

        const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Video processing failed';

        channels.push({
          channelId: channel.id,
          channelName: channel.name,
          status: 'failed',
          reason: message,
        });

        if (taskJobId) {
          taskQueueRepository.appendLogMessage(taskJobId, 'err', `Failed ${channel.name}: ${message}`);
        }
      }
    }

    if (taskJobId) {
      taskQueueRepository.setLivePhase(taskJobId, 'done');
    }

    return { channels, items };
  }

  async createVideosForAllReupChannels(options?: CreateVideosOptions): Promise<CreateReupVideosBatchResult> {
    const reupChannelIds = youtubeChannelsRepository
      .findAll()
      .filter(channel => isReupChannelType(channel.type))
      .map(channel => channel.id);

    if (reupChannelIds.length === 0) {
      throw new AppError('No reup channels found', 400, 'NO_REUP_CHANNELS');
    }

    return this.createVideosForChannels(reupChannelIds, options);
  }

  async prepareVideosForChannels(channelIds: string[], options?: CreateVideosOptions): Promise<CreateReupVideosBatchResult> {
    return this.createVideosForChannels(channelIds, { ...options, skipVideoAssembly: true });
  }

  async prepareVideosForAllReupChannels(options?: CreateVideosOptions): Promise<CreateReupVideosBatchResult> {
    return this.createVideosForAllReupChannels({ ...options, skipVideoAssembly: true });
  }
}

export const videoProductionService = new VideoProductionService();
