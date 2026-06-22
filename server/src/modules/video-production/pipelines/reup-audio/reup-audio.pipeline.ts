import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { generateId } from '../../../../shared/id.js';
import type { SourceVideoRecord } from '../../../source-channels/source-channels.types.js';
import { cleanSrt } from '../../../../infrastructure/subtitle/clean-srt.js';
import type { TranscriptLanguage } from '../../../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadReupAssets, downloadReupAudioAssets } from '../../shared/assets/asset-downloader.js';
import { updateTranscriptWithLlm } from '../../shared/assets/transcript-updater.js';
import { runMetaStep1 } from '../../shared/meta/meta-step1.js';
import { runMetaStep2 } from '../../shared/meta/meta-step2.js';
import { runMetaStep3 } from '../../shared/meta/meta-step3.js';
import { runHeroImageGeneration } from '../../shared/thumbnail/hero-image.js';
import { runDirectFlowThumbnail } from '../../shared/thumbnail/direct-flow-thumbnail.js';
import { runThumbnailHorizontal } from '../../shared/thumbnail/thumbnail-horizontal.js';
import { renderThumbnailHorizontalFlowCompositeToPath } from '../../shared/thumbnail/thumbnail-composite.js';
import {
  isHorizontalMultiStepStyle,
  resolveThumbnailStyleKey,
} from '../../../prompts/thumbnail-styles.js';
import { assembleReupSiVideo } from '../../shared/si-video/si-video-assembler.js';
import type { MetaStep1ChunkDigest, MetaStep2StoryBlock, MetaStep3Output } from '../../shared/meta/metadata.types.js';
import type { ThumbnailHorizontalOutput } from '../../shared/thumbnail/thumbnail.types.js';
import { SI_OUTPUT_VIDEO_BASENAME } from '../../shared/si-video/si.constants.js';
import { videoPrepareRepository } from '../../../youtube-channels/video-prepare.repository.js';
import { moveVideoFolderToDestination, remapOutputItemPaths } from './video-folder-mover.js';
import { REUP_VIDEOS_PER_RUN } from './reup-audio.constants.js';
import type {
  CreateReupVideosResult,
  ReupVideoOutputItem,
  ReupVideoTask,
} from './reup-audio.types.js';
import { sourceCatalogAdapter } from '../../adapters/source-catalog.adapter.js';
import type { ProductionDestination } from '../../ports/production-destination.port.js';
import type { SourceCatalog } from '../../ports/source-catalog.port.js';
import { taskQueueRepository } from '../../../task-queue/task-queue.repository.js';

interface CreateVideosOptions {
  taskJobId?: string;
  skipLivePhaseDone?: boolean;
  /** Khi true: bỏ qua bước assembleReupSiVideo, video sẽ ở status Prepared */
  skipVideoAssembly?: boolean;
}

function isReupAudioPipeline(pipelineType: ProductionDestination['pipelineType']): boolean {
  return pipelineType === 'reup_audio';
}

interface SourceVideoWithSource extends SourceVideoRecord {
  sourceId: string;
}

function collectSourceVideos(sourceCatalog: SourceCatalog, sourceChannels: string[]): SourceVideoWithSource[] {
  const videos: SourceVideoWithSource[] = [];

  for (const source of sourceCatalog.resolveSources(sourceChannels)) {
    for (const video of sourceCatalog.listVideos(source.id)) {
      videos.push({ ...video, sourceId: source.id });
    }
  }

  return videos;
}

const SKIP_ON_CREATE_CODES = new Set(['NO_SOURCE_MAPPING', 'SOURCE_NOT_FOUND', 'NO_SOURCE_VIDEOS', 'NO_UNPROCESSED_VIDEOS']);

function resolveVideoPrepareTitle(outputItem: ReupVideoOutputItem): string {
  const title = outputItem.metaStep3Output?.metadata?.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return outputItem.youtubeVideoId;
}

function buildTasks(destination: ProductionDestination, videos: SourceVideoWithSource[]): ReupVideoTask[] {
  const preparedVideoIds = destination.getPreparedVideoIds();

  return videos
    .filter(video => Boolean(video.url) && !preparedVideoIds.has(video.id))
    .slice(0, REUP_VIDEOS_PER_RUN)
    .map(video => ({
      link: video.url,
      id: destination.id,
      language: destination.language,
      videoId: video.id,
      sourceId: video.sourceId,
    }));
}

export class ReupAudioPipeline {
  constructor(private readonly sourceCatalog: SourceCatalog) {}

  async run(destination: ProductionDestination, options?: CreateVideosOptions): Promise<CreateReupVideosResult> {
    if (!isReupAudioPipeline(destination.pipelineType) && destination.pipelineType !== 'reup') {
      throw new AppError('Pipeline only supports reup audio channels', 400, 'INVALID_CHANNEL_TYPE');
    }

    if (destination.sourceChannels.length === 0) {
      throw new AppError('Channel has no source mapping configured', 400, 'NO_SOURCE_MAPPING');
    }

    const sources = this.sourceCatalog.resolveSources(destination.sourceChannels);
    if (sources.length === 0) {
      throw new AppError('No source channels matched source mapping', 400, 'SOURCE_NOT_FOUND');
    }

    const allVideos = collectSourceVideos(this.sourceCatalog, destination.sourceChannels);
    if (allVideos.length === 0) {
      throw new AppError('No source videos available for mapped sources', 400, 'NO_SOURCE_VIDEOS');
    }

    const tasks = buildTasks(destination, allVideos);
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    destination.ensurePrepareStore();

    const items: ReupVideoOutputItem[] = [];
    const isAudioChannel = isReupAudioPipeline(destination.pipelineType);

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

          const downloaded = await downloadReupAudioAssets(task.link, destination.language);

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
          if (destination.language === 'ja') {
            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'info', `Updating transcript via LLM (${destination.language})...`);
            }

            updatedSrtPath = await updateTranscriptWithLlm(srtPath, destination.language as TranscriptLanguage, {
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

            metaStep1ChunkDigests = await runMetaStep1(updatedSrtPath, destination.language, {
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

              metaStep2StoryBlocks = await runMetaStep2(metaStep1ChunkDigests, destination.language, downloaded.youtubeVideoId, {
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

              metaStep3Output = await runMetaStep3(step3Items, destination.language, downloaded.youtubeVideoId, {
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

              const workDir = path.dirname(updatedSrtPath);
              const styleKey = resolveThumbnailStyleKey(destination.thumbnailStyleKey, destination.language);
              const useHorizontalFlow = styleKey
                ? isHorizontalMultiStepStyle(styleKey, destination.language)
                : false;

              if (useHorizontalFlow && styleKey) {
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating horizontal thumbnail (LLM step 1/2/3)...');
                }

                try {
                  thumbnailHorizontalOutput = await runThumbnailHorizontal(
                    metaStep3Output,
                    destination.language,
                    styleKey,
                    {
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
                    },
                  );

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
              } else if (styleKey) {
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(
                    taskJobId,
                    'info',
                    `Creating thumbnail via Flow (${styleKey})...`,
                  );
                }

                try {
                  const directResult = await runDirectFlowThumbnail(
                    metaStep3Output,
                    destination.language,
                    styleKey,
                    workDir,
                    {
                      onProgress: taskJobId
                        ? progress => {
                            const profileLabel = progress.profileName;
                            if (progress.status === 'retry') {
                              taskQueueRepository.appendLogMessage(
                                taskJobId,
                                'info',
                                `Thumbnail on ${profileLabel} retry (attempt ${progress.attempt})...`,
                              );
                              return;
                            }
                            taskQueueRepository.appendLogMessage(
                              taskJobId,
                              'info',
                              `Thumbnail on ${profileLabel} (attempt ${progress.attempt})...`,
                            );
                          }
                        : undefined,
                    },
                  );
                  reupThumbnailPath = directResult.thumbnailPath;

                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Thumbnail saved → thumbnail.jpg');
                  }
                } catch (err) {
                  const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail generation failed';
                  console.warn(`[reup-video] direct flow thumbnail skipped (non-fatal): ${message}`);
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail skipped: ${message}`);
                  }
                }
              }

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Generating hero image with Google Flow...');
              }

              const heroResult = await runHeroImageGeneration(metaStep3Output, downloaded.youtubeVideoId, workDir, {
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

              const flowDebugPath = path.join(workDir, 'flow-debug.png');
              await fs.unlink(flowDebugPath).catch(() => undefined);

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Hero image saved → background.jpg`);
              }

              if (useHorizontalFlow) {
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
                    const compositeOutPath = path.join(workDir, 'thumbnail.jpg');
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
          }

          if (!options?.skipVideoAssembly && updatedSrtPath && downloaded.audioPath && heroImagePath) {
            if (!destination.backgroundFootageSources?.length) {
              console.warn(`[reup-video] SI video assembly skipped: channel ${destination.id} has no backgroundFootageSources`);
              if (taskJobId) {
                taskQueueRepository.appendLogMessage(
                  taskJobId,
                  'info',
                  'SI video assembly skipped: no backgroundFootageSources configured on channel',
                );
              }
            } else {
              if (taskJobId) {
                taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg');
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Assembling SI video (stock + overlay + subtitles)...');
              }

              reupVideoPath = await assembleReupSiVideo({
                workDir: path.dirname(updatedSrtPath),
                audioPath: downloaded.audioPath,
                subtitlePath: updatedSrtPath,
                centerImagePath: heroImagePath,
                backgroundFootageSourceIds: destination.backgroundFootageSources,
                language: destination.language,
                onLog: taskJobId ? msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg) : undefined,
              });
              primaryOutputPath = reupVideoPath;

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'SI video saved → video.mp4');
              }
            }
          } else if (options?.skipVideoAssembly && taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'info', 'SI video assembly skipped (prepare-only mode)');
          }

          outputItem = {
            link: task.link,
            channelId: destination.id,
            language: destination.language,
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

          const downloaded = await downloadReupAssets(task.link, destination.pipelineType, destination.language);

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Video saved → ${downloaded.videoPath}`);
          }

          outputItem = {
            link: task.link,
            channelId: destination.id,
            language: destination.language,
            videoId: task.videoId,
            youtubeVideoId: downloaded.youtubeVideoId,
            outputPath: downloaded.primaryPath,
            ...(downloaded.videoPath ? { videoPath: downloaded.videoPath } : {}),
          };
        }

        const sourceDir = mediaDownloadDir('youtube', outputItem.youtubeVideoId);
        const expectedDestDir = destination.getVideoOutputDir(outputItem.youtubeVideoId);
        const destDir = await moveVideoFolderToDestination('youtube', outputItem.youtubeVideoId, expectedDestDir);
        outputItem = remapOutputItemPaths(outputItem, sourceDir, destDir);

        if (path.resolve(destDir) === path.resolve(expectedDestDir)) {
          destination.trackPreparedVideo({
            id: generateId(),
            videoId: outputItem.youtubeVideoId,
            title: resolveVideoPrepareTitle(outputItem),
            status: 'Prepared',
          });

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Video prepare tracked → video-prepare.json');
          }

          if (!options?.skipVideoAssembly) {
            const finalVideoPath = path.join(destDir, `${SI_OUTPUT_VIDEO_BASENAME}.mp4`);
            try {
              await fs.access(finalVideoPath);
              videoPrepareRepository.markCreated(destination.id, outputItem.youtubeVideoId);
              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Video ready → status Created in video-prepare.json');
              }
            } catch {
              /* video.mp4 not ready yet — stays Prepared */
            }
          } else if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Video assets saved → status Prepared in video-prepare.json');
          }
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
}

export const reupAudioPipeline = new ReupAudioPipeline(sourceCatalogAdapter);
