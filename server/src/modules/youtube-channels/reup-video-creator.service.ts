import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { sourceVideosRepository } from '../source-channels/source-videos.repository.js';
import type { SourceChannel, SourceVideoRecord } from '../source-channels/source-channels.types.js';
import { resolveSourceChannelsFromMapping } from './youtube-channel-sources.js';
import { cleanSrt } from '../../infrastructure/subtitle/clean-srt.js';
import type { TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadReupAssets, downloadReupAudioAssets } from './reup-asset-downloader.js';
import { updateTranscriptWithLlm } from './reup-transcript-updater.js';
import { runMetaStep1 } from './reup-meta-step1.js';
import { runMetaStep2 } from './reup-meta-step2.js';
import { runMetaStep3 } from './reup-meta-step3.js';
import { runHeroImageGeneration } from './reup-hero-image.js';
import { runThumbnailHorizontal } from './reup-thumbnail-horizontal.js';
import { renderThumbnailHorizontalFlowCompositeToPath } from './reup-thumbnail-composite.js';
import { assembleReupSiVideo } from './reup-si-video-assembler.js';
import type { MetaStep1ChunkDigest, MetaStep2StoryBlock, MetaStep3Output } from './reup-metadata.types.js';
import type { ThumbnailHorizontalOutput } from './reup-thumbnail.types.js';
import { reupVideoHistoryRepository } from './reup-video-history.repository.js';
import { moveVideoFolderToChannel, remapOutputItemPaths } from './reup-video-folder-mover.js';
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
          let metaStep1ChunkDigests: MetaStep1ChunkDigest[] | undefined;
          let metaStep2StoryBlocks: MetaStep2StoryBlock[] | undefined;
          let metaStep3Output: MetaStep3Output | undefined;
          let thumbnailHorizontalOutput: ThumbnailHorizontalOutput | undefined;
          let heroImagePath: string | undefined;
          let thumbnailVisualPath: string | undefined;
          let reupThumbnailPath: string | undefined;
          let reupVideoPath: string | undefined;
          let primaryOutputPath = downloaded.audioPath;
          if (channel.language === 'ja') {
            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'info', `Updating transcript via LLM (${channel.language})...`);
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
                      taskQueueRepository.appendLogMessage(taskJobId, 'info', `LLM batch ${label} on ${profileLabel} fallback to original`);
                      return;
                    }

                    taskQueueRepository.appendLogMessage(taskJobId, 'ok', `LLM batch ${label} on ${profileLabel} done`);
                  }
                : undefined,
            });

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Transcript saved → transcript.srt`);
            }

            if (taskJobId) {
              taskQueueRepository.setLivePhase(taskJobId, 'metadata');
              taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating metadata step 1...');
            }

            metaStep1ChunkDigests = await runMetaStep1(updatedSrtPath, channel.language, {
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
                        `Meta step 1 batch ${label} on ${profileLabel} fallback to raw chunk digest`,
                      );
                      return;
                    }

                    taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Meta step 1 batch ${label} on ${profileLabel} done`);
                  }
                : undefined,
            });

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Metadata step 1 done → ${metaStep1ChunkDigests.length} chunk_digests`);
            }

            if (metaStep1ChunkDigests.length >= 2) {
              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating metadata step 2...');
              }

              metaStep2StoryBlocks = await runMetaStep2(metaStep1ChunkDigests, channel.language, downloaded.youtubeVideoId, {
                outputDir: path.dirname(updatedSrtPath),
                onProgress: taskJobId
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
                          `Meta step 2 batch ${label} on ${profileLabel} fallback to merged chunk digests`,
                        );
                        return;
                      }

                      taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Meta step 2 batch ${label} on ${profileLabel} done`);
                    }
                  : undefined,
              });

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Metadata step 2 done → ${metaStep2StoryBlocks.length} story_blocks`);
              }
            }

            const step3Items = metaStep2StoryBlocks ?? metaStep1ChunkDigests;
            if (step3Items && step3Items.length > 0) {
              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating metadata step 3...');
              }

              metaStep3Output = await runMetaStep3(step3Items, channel.language, downloaded.youtubeVideoId, {
                outputDir: path.dirname(updatedSrtPath),
                onProgress: taskJobId
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
              });

              if (taskJobId) {
                const videoMetaPath = path.join(path.dirname(updatedSrtPath), 'video-meta.json');
                taskQueueRepository.appendLogMessage(
                  taskJobId,
                  'ok',
                  `Metadata step 3 done → ${videoMetaPath}, title: ${metaStep3Output.metadata.title}, hero: ${
                    typeof metaStep3Output.hero_image_prompt.prompt === 'string' && metaStep3Output.hero_image_prompt.prompt.length > 80
                      ? `${metaStep3Output.hero_image_prompt.prompt.slice(0, 80)}...`
                      : metaStep3Output.hero_image_prompt.prompt
                  }`,
                );
              }

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating horizontal thumbnail (LLM step 1/2/3)...');
              }

              try {
                thumbnailHorizontalOutput = await runThumbnailHorizontal(metaStep3Output, {
                  onProgress: taskJobId
                    ? progress => {
                        const profileLabel = progress.profileName;
                        const stepLabel = `step ${progress.step}/3`;

                        if (progress.status === 'retry') {
                          taskQueueRepository.appendLogMessage(
                            taskJobId,
                            'info',
                            `Thumbnail ${stepLabel} on ${profileLabel} retry (attempt ${progress.attempt})...`,
                          );
                          return;
                        }

                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Thumbnail ${stepLabel} on ${profileLabel} (attempt ${progress.attempt})...`,
                        );
                      }
                    : undefined,
                });

                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Horizontal thumbnail LLM done');
                }
              } catch (err) {
                const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail generation failed';
                console.warn(`[reup-video] thumbnail LLM skipped (non-fatal): ${message}`);
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail LLM skipped: ${message}`);
                }
              }

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Generating hero image with Google Flow...');
              }

              const heroResult = await runHeroImageGeneration(metaStep3Output, downloaded.youtubeVideoId, path.dirname(updatedSrtPath), {
                ...(thumbnailHorizontalOutput
                  ? {
                      thumbnailVisual: {
                        visualPrompt: thumbnailHorizontalOutput.plan.visualPrompt,
                        negativePrompt: thumbnailHorizontalOutput.plan.negativePrompt,
                      },
                    }
                  : {}),
                onProgress: taskJobId
                  ? progress => {
                      const profileLabel = progress.profileName;
                      if (progress.status === 'retry') {
                        taskQueueRepository.appendLogMessage(
                          taskJobId,
                          'info',
                          `Hero image on ${profileLabel} retry (attempt ${progress.attempt})...`,
                        );
                        return;
                      }
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `Hero image on ${profileLabel} (attempt ${progress.attempt})...`,
                      );
                    }
                  : undefined,
              });
              heroImagePath = heroResult.heroImagePath;
              thumbnailVisualPath = heroResult.thumbnailVisualPath;

              const flowDebugPath = path.join(path.dirname(updatedSrtPath), 'flow-debug.png');
              await fs.unlink(flowDebugPath).catch(() => undefined);

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Hero image saved → background.jpg`);
              }

              if (taskJobId) {
                if (thumbnailVisualPath) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Thumbnail visual saved → thumbnail_visual.jpg`);
                } else {
                  taskQueueRepository.appendLogMessage(
                    taskJobId,
                    'info',
                    'Thumbnail visual generation skipped or failed (background.jpg kept)',
                  );
                }
              }

              if (thumbnailHorizontalOutput && thumbnailVisualPath) {
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Compositing horizontal thumbnail (canvas)...');
                }

                try {
                  const compositeOutPath = path.join(path.dirname(updatedSrtPath), 'thumbnail.jpg');
                  reupThumbnailPath = await renderThumbnailHorizontalFlowCompositeToPath({
                    backgroundImagePath: thumbnailVisualPath,
                    flowLayout: {
                      thumbnail_copy: thumbnailHorizontalOutput.plan.thumbnailCopy,
                      color_strategy: thumbnailHorizontalOutput.plan.colorStrategy,
                    },
                    outPath: compositeOutPath,
                  });

                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Thumbnail composite saved → thumbnail.jpg`);
                  }
                } catch (err) {
                  const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail composite failed';
                  console.warn(`[reup-video] thumbnail composite skipped (non-fatal): ${message}`);
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail composite skipped: ${message}`);
                  }
                }
              }
            }
          }

          // if (updatedSrtPath && downloaded.audioPath && heroImagePath) {
          //   if (!channel.backgroundFootageSourceId) {
          //     console.warn(`[reup-video] SI video assembly skipped: channel ${channel.id} has no backgroundFootageSourceId`);
          //     if (taskJobId) {
          //       taskQueueRepository.appendLogMessage(
          //         taskJobId,
          //         'info',
          //         'SI video assembly skipped: no backgroundFootageSourceId configured on channel',
          //       );
          //     }
          //   } else {
          //     if (taskJobId) {
          //       taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg');
          //       taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Assembling SI video (stock + overlay + subtitles)...');
          //     }

          //     reupVideoPath = await assembleReupSiVideo({
          //       workDir: path.dirname(updatedSrtPath),
          //       audioPath: downloaded.audioPath,
          //       subtitlePath: updatedSrtPath,
          //       centerImagePath: heroImagePath,
          //       backgroundFootageSourceId: channel.backgroundFootageSourceId,
          //       language: channel.language,
          //       onLog: taskJobId ? msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg) : undefined,
          //     });
          //     primaryOutputPath = reupVideoPath;

          //     if (taskJobId) {
          //       taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'SI video saved → video.mp4');
          //     }
          //   }
          // }

          reupVideoHistoryRepository.markProcessed({
            channelId: channel.id,
            videoUrl: task.link,
            videoId: task.videoId,
            outputPath: primaryOutputPath,
            processedAt: new Date().toISOString(),
          });

          outputItem = {
            link: task.link,
            channelId: channel.id,
            language: channel.language,
            videoId: task.videoId,
            youtubeVideoId: downloaded.youtubeVideoId,
            outputPath: primaryOutputPath,
            thumbnailPath: downloaded.thumbnailPath,
            audioPath: downloaded.audioPath,
            ...(updatedSrtPath
              ? {
                  updatedSrtPath,
                  ...(metaStep1ChunkDigests ? { metaStep1ChunkDigests } : {}),
                  ...(metaStep2StoryBlocks ? { metaStep2StoryBlocks } : {}),
                  ...(metaStep3Output ? { metaStep3Output } : {}),
                  ...(thumbnailHorizontalOutput ? { thumbnailHorizontalOutput } : {}),
                  ...(heroImagePath ? { heroImagePath } : {}),
                  ...(thumbnailVisualPath ? { thumbnailVisualPath } : {}),
                  ...(reupThumbnailPath ? { reupThumbnailPath } : {}),
                  ...(reupVideoPath ? { reupVideoPath } : {}),
                }
              : { transcriptPath: downloaded.transcriptPath, srtPath }),
          };
        } else {
          if (taskJobId) {
            taskQueueRepository.setLivePhase(taskJobId, 'downloading');
            taskQueueRepository.appendLogMessage(taskJobId, 'info', `Downloading source video ${task.videoId}...`);
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

        const sourceDir = mediaDownloadDir('youtube', outputItem.youtubeVideoId);
        const destDir = await moveVideoFolderToChannel(channel.id, outputItem.youtubeVideoId);
        outputItem = remapOutputItemPaths(outputItem, sourceDir, destDir);
        reupVideoHistoryRepository.updateOutputPath(channel.id, task.link, outputItem.outputPath);

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
