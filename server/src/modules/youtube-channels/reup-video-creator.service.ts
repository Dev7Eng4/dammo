import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { sourceVideosRepository } from '../source-channels/source-videos.repository.js';
import type { SourceChannel, SourceVideoRecord } from '../source-channels/source-channels.types.js';
import { resolveSourceChannelsFromMapping } from './youtube-channel-sources.js';
import { cleanSrt } from '../../infrastructure/subtitle/clean-srt.js';
import type { TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import {
  downloadReupAssets,
  downloadReupAudioAssets,
} from './reup-asset-downloader.js';
import { updateTranscriptWithLlm } from './reup-transcript-updater.js';
import { runMetaStep1 } from './reup-meta-step1.js';
import { runMetaPipelineAfterStep1 } from './reup-meta-pipeline.js';
import type { MetaStep1MicroSegment, MetaStep3Output, MetaStep4Output } from './reup-metadata.types.js';
import { reupVideoHistoryRepository } from './reup-video-history.repository.js';
import { REUP_VIDEOS_PER_RUN } from './reup-video.constants.js';
import type {
  CreateReupVideosBatchResult,
  CreateReupVideosResult,
  ReupVideoBatchChannelResult,
  ReupVideoOutputItem,
  ReupVideoTask,
} from './reup-video.types.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from './youtube-channels.types.js';
import { taskQueueRepository } from '../task-queue/task-queue.repository.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';

interface CreateVideosOptions {
  taskJobId?: string;
  skipLivePhaseDone?: boolean;
}

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function isReupAudioChannel(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio';
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

const SKIP_ON_CREATE_CODES = new Set(['NO_SOURCE_MAPPING', 'SOURCE_NOT_FOUND', 'NO_SOURCE_VIDEOS', 'NO_UNPROCESSED_VIDEOS']);

function isSkippableCreateError(err: unknown): err is AppError {
  return err instanceof AppError && Boolean(err.code && SKIP_ON_CREATE_CODES.has(err.code));
}

function buildTasks(channel: YoutubeChannel, videos: SourceVideoWithSource[]): ReupVideoTask[] {
  const processedUrls = reupVideoHistoryRepository.getProcessedVideoUrls(channel.id);

  return videos
    .filter(video => video.url && !processedUrls.has(video.url.trim().toLowerCase()))
    .slice(0, REUP_VIDEOS_PER_RUN)
    .map(video => ({
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
      throw new AppError('Only reup audio or reup video channels can create videos', 400, 'INVALID_CHANNEL_TYPE');
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
    console.log('🚀 ~ ReupVideoCreatorService ~ createVideos ~ tasks:', tasks);
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    const items: ReupVideoOutputItem[] = [];
    const isAudioChannel = isReupAudioChannel(channel.type);

    for (const task of tasks) {
      const taskJobId = options?.taskJobId;

      try {
        let outputItem: ReupVideoOutputItem;

        if (isAudioChannel) {
          if (taskJobId) {
            taskQueueRepository.setLivePhase(taskJobId, 'downloading');
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'info',
              `Downloading thumbnail + audio + transcript (${task.language}) for source video ${task.videoId}...`,
            );
          }

          const downloaded = await downloadReupAudioAssets(task.link, channel.language);

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Thumbnail saved → ${downloaded.thumbnailPath}`);
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Audio saved → ${downloaded.audioPath}`);
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Transcript saved → ${downloaded.transcriptPath}`);
          }

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Cleaning transcript → SRT...');
          }

          const srtPath = await cleanSrt(downloaded.transcriptPath);

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `SRT cleaned → ${srtPath}`);
          }

          let updatedSrtPath: string | undefined;
          let metaStep1MicroSegments: MetaStep1MicroSegment[] | undefined;
          let metaStep3Output: MetaStep3Output | undefined;
          let metaStep4Output: MetaStep4Output | undefined;
          if (channel.language === 'ja') {
            if (taskJobId) {
              taskQueueRepository.appendLogMessage(
                taskJobId,
                'info',
                `Updating transcript via LLM (${channel.language})...`,
              );
            }

            updatedSrtPath = await updateTranscriptWithLlm(srtPath, channel.language as TranscriptLanguage, {
              onProgress: taskJobId
                ? progress => {
                    const label = `${progress.batchIndex}/${progress.totalBatches}`;
                    const profileLabel = progress.profileName;

                    if (progress.status === 'started') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `LLM batch ${label} on ${profileLabel} (attempt ${progress.attempt})...`,
                      );
                      return;
                    }

                    if (progress.status === 'retry') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `LLM batch ${label} on ${profileLabel} retry (attempt ${progress.attempt})...`,
                      );
                      return;
                    }

                    if (progress.status === 'fallback') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `LLM batch ${label} on ${profileLabel} fallback to original`,
                      );
                      return;
                    }

                    taskQueueRepository.appendLogMessage(
                      taskJobId,
                      'ok',
                      `LLM batch ${label} on ${profileLabel} done`,
                    );
                  }
                : undefined,
            });

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Transcript updated → ${updatedSrtPath}`);
            }

            if (taskJobId) {
              taskQueueRepository.setLivePhase(taskJobId, 'metadata');
              taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating metadata step 1...');
            }

            metaStep1MicroSegments = await runMetaStep1(updatedSrtPath, channel.language, {
              onProgress: taskJobId
                ? progress => {
                    const label = `${progress.batchIndex}/${progress.totalBatches}`;
                    const profileLabel = progress.profileName;

                    if (progress.status === 'started') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Meta step 1 batch ${label} on ${profileLabel} (attempt ${progress.attempt})...`,
                      );
                      return;
                    }

                    if (progress.status === 'retry') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Meta step 1 batch ${label} on ${profileLabel} retry (attempt ${progress.attempt})...`,
                      );
                      return;
                    }

                    if (progress.status === 'fallback') {
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Meta step 1 batch ${label} on ${profileLabel} fallback to raw segment`,
                      );
                      return;
                    }

                    taskQueueRepository.appendLogMessage(
                      taskJobId,
                      'ok',
                      `Meta step 1 batch ${label} on ${profileLabel} done`,
                    );
                  }
                : undefined,
            });

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(
                taskJobId,
                'ok',
                `Metadata step 1 done → ${metaStep1MicroSegments.length} micro_segments`,
              );
              taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Running metadata pipeline (steps 2–4)...');
            }

            const metaPipelineResult = await runMetaPipelineAfterStep1(
              metaStep1MicroSegments,
              channel.language,
              downloaded.youtubeVideoId,
              {
                outputDir: path.dirname(updatedSrtPath),
                onStep2Progress: taskJobId
                  ? progress => {
                      const label = `${progress.batchIndex}/${progress.totalBatches}`;
                      const profileLabel = progress.profileName;

                      if (progress.status === 'started') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Meta step 2 batch ${label} on ${profileLabel} (attempt ${progress.attempt})...`,
                        );
                        return;
                      }

                      if (progress.status === 'retry') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Meta step 2 batch ${label} on ${profileLabel} retry (attempt ${progress.attempt})...`,
                        );
                        return;
                      }

                      if (progress.status === 'fallback') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Meta step 2 batch ${label} on ${profileLabel} fallback to micro_segments`,
                        );
                        return;
                      }

                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'ok',
                        `Meta step 2 batch ${label} on ${profileLabel} done`,
                      );
                    }
                  : undefined,
                onStep3Progress: taskJobId
                  ? progress => {
                      const profileLabel = progress.profileName;

                      if (progress.status === 'retry') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Meta step 3 on ${profileLabel} retry (attempt ${progress.attempt})...`,
                        );
                        return;
                      }

                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Meta step 3 on ${profileLabel} (attempt ${progress.attempt})...`,
                      );
                    }
                  : undefined,
                onStep4Progress: taskJobId
                  ? progress => {
                      const profileLabel = progress.profileName;

                      if (progress.status === 'retry') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Meta step 4 on ${profileLabel} retry (attempt ${progress.attempt})...`,
                        );
                        return;
                      }

                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Meta step 4 on ${profileLabel} (attempt ${progress.attempt})...`,
                      );
                    }
                  : undefined,
              },
            );

            metaStep3Output = metaPipelineResult.step3;
            metaStep4Output = metaPipelineResult.step4;

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(
                taskJobId,
                'ok',
                `Metadata step 3 done → ${metaStep3Output.chapters.length} chapters, title: ${metaStep3Output.metadata.title}`,
              );
              taskQueueRepository.appendLogMessage(
                taskJobId,
                'ok',
                `Metadata step 4 done → hero image prompt ready (${metaStep4Output.hero_image_package.conflict_type})`,
              );
            }
          }

          reupVideoHistoryRepository.markProcessed({
            channelId: channel.id,
            videoUrl: task.link,
            videoId: task.videoId,
            outputPath: downloaded.audioPath,
            processedAt: new Date().toISOString(),
          });

          outputItem = {
            link: task.link,
            channelId: channel.id,
            language: channel.language,
            videoId: task.videoId,
            youtubeVideoId: downloaded.youtubeVideoId,
            outputPath: downloaded.audioPath,
            thumbnailPath: downloaded.thumbnailPath,
            audioPath: downloaded.audioPath,
            ...(updatedSrtPath
              ? {
                  updatedSrtPath,
                  ...(metaStep1MicroSegments ? { metaStep1MicroSegments } : {}),
                  ...(metaStep3Output ? { metaStep3Output } : {}),
                  ...(metaStep4Output ? { metaStep4Output } : {}),
                }
              : { transcriptPath: downloaded.transcriptPath, srtPath }),
          };
        } else {
          if (taskJobId) {
            taskQueueRepository.setLivePhase(taskJobId, 'downloading');
            taskQueueRepository.appendLogMessage(
              taskJobId,
              'info',
              `Downloading source video ${task.videoId}...`,
            );
          }

          const downloaded = await downloadReupAssets(task.link, channel.type, channel.language);

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Video saved → ${downloaded.videoPath}`);
          }

          reupVideoHistoryRepository.markProcessed({
            channelId: channel.id,
            videoUrl: task.link,
            videoId: task.videoId,
            outputPath: downloaded.primaryPath,
            processedAt: new Date().toISOString(),
          });

          outputItem = {
            link: task.link,
            channelId: channel.id,
            language: channel.language,
            videoId: task.videoId,
            youtubeVideoId: downloaded.youtubeVideoId,
            outputPath: downloaded.primaryPath,
            ...(downloaded.videoPath ? { videoPath: downloaded.videoPath } : {}),
          };
        }

        items.push(outputItem);
      } catch (err) {
        if (taskJobId) {
          const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Video processing failed';
          taskQueueRepository.appendLogMessage(taskJobId, 'err', message);
        }
        throw err;
      }
    }

    if (options?.taskJobId && !options.skipLivePhaseDone) {
      taskQueueRepository.setLivePhase(options.taskJobId, 'done');
    }

    return { items };
  }

  async createVideosForChannels(channelIds: string[], options?: CreateVideosOptions): Promise<CreateReupVideosBatchResult> {
    console.log('🚀 ~ ReupVideoCreatorService ~ createVideosForChannels ~ channelIds:', channelIds);
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
        const result = await this.createVideos(channel.id, {
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
}

export const reupVideoCreatorService = new ReupVideoCreatorService();
