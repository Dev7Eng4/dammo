import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir, resolveSourceChannelVideoDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { generateId } from '../../../../shared/id.js';
import { timedStep, type TimedStepOptions } from '../../../../shared/timing/step-timer.js';
import type { SourceVideoRecord } from '../../../source-channels/source-channels.types.js';
import { cleanSrt } from '../../../../infrastructure/subtitle/clean-srt.js';
import type { TranscriptLanguage } from '../../../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadYoutubeVideo } from '../../../../infrastructure/youtube/youtube-video-downloader.js';
import {
  downloadReupAssets,
  downloadReupAudioAssets,
  type ReupAudioDownloadResult,
  type ReupDownloadResult,
} from '../../shared/assets/asset-downloader.js';
import { updateTranscriptWithLlm } from '../../shared/assets/transcript-updater.js';
import { runMetadata } from '../../shared/meta/run-metadata.js';
import { runGeneralImage } from '../../shared/thumbnail/run-general-image.js';
import { runThumbnailVisualGeneration } from '../../shared/thumbnail/hero-image.js';
import { runDefaultFlowThumbnail } from '../../shared/thumbnail/default-flow-thumbnail.js';
import { runDirectFlowThumbnail } from '../../shared/thumbnail/direct-flow-thumbnail.js';
import { runThumbnailHorizontal } from '../../shared/thumbnail/thumbnail-horizontal.js';
import { renderThumbnailHorizontalFlowCompositeToPath } from '../../shared/thumbnail/thumbnail-composite.js';
import { isHorizontalMultiStepStyle, resolveThumbnailStyleKey } from '../../../prompts/thumbnail-styles.js';
import { assembleReupSiVideo } from '../../shared/si-video/si-video-assembler.js';
import { generateAiVideoImages } from '../../shared/ai-video/index.js';
import type { AiVideoScenePrompt } from '../../shared/ai-video/ai-video.types.js';
import { hasLegacyVisualMeta, type MetaStep3Output, type VideoMetaOutput } from '../../shared/meta/metadata.types.js';
import type { ThumbnailHorizontalOutput } from '../../shared/thumbnail/thumbnail.types.js';
import { SI_OUTPUT_VIDEO_BASENAME } from '../../shared/si-video/si.constants.js';
import { videoPrepareRepository } from '../../../youtube-channels/video-prepare.repository.js';
import { moveVideoFolderToDestination, remapOutputItemPaths } from './video-folder-mover.js';
import { REUP_VIDEOS_PER_RUN } from './reup-audio.constants.js';
import type { CreateReupVideosResult, ReupVideoOutputItem, ReupVideoTask } from './reup-audio.types.js';
import { sourceCatalogAdapter } from '../../adapters/source-catalog.adapter.js';
import type { ProductionDestination } from '../../ports/production-destination.port.js';
import type { ReupAudioVideoType } from '../../../youtube-channels/youtube-channels.types.js';
import type { SourceCatalog } from '../../ports/source-catalog.port.js';
import { taskQueueRepository } from '../../../task-queue/task-queue.repository.js';
import { copySourceAssetsToDir, findSourceThumbnailPath, findSourceTranscriptPath } from '../../../source-channels/source-assets.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';

interface CreateVideosOptions {
  taskJobId?: string;
  skipLivePhaseDone?: boolean;
  /** Khi true: bỏ qua bước assembleReupSiVideo, video sẽ ở status Prepared */
  skipVideoAssembly?: boolean;
  /** Số video tối đa xử lý trên mỗi channel trong một lần chạy */
  maxVideosPerChannel?: number;
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

/** Chọn video theo thứ tự mảng (index 0 trước), bỏ qua video đã prepare. */
function selectVideosTopDown(videos: SourceVideoWithSource[], preparedVideoIds: Set<string>, limit: number): SourceVideoWithSource[] {
  return videos.filter(video => Boolean(video.url) && !preparedVideoIds.has(video.id)).slice(0, limit);
}

const SKIP_ON_CREATE_CODES = new Set(['NO_SOURCE_MAPPING', 'SOURCE_NOT_FOUND', 'NO_SOURCE_VIDEOS', 'NO_UNPROCESSED_VIDEOS']);

function resolveVideoPrepareTitle(outputItem: ReupVideoOutputItem): string {
  const title = outputItem.videoMetaOutput?.metadata?.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return outputItem.youtubeVideoId;
}

function createStepTimer(taskJobId: string | undefined, videoId: string): Pick<TimedStepOptions, 'prefix' | 'onLog'> {
  return {
    prefix: `[reup-video] ${videoId}`,
    onLog: taskJobId ? msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg) : undefined,
  };
}

async function resolveReupAudioDownload(
  task: ReupVideoTask,
  language: ChannelLanguage,
  taskJobId?: string
): Promise<ReupAudioDownloadResult> {
  const outputDir = mediaDownloadDir('youtube', task.videoId);

  if (task.sourceStatus === 'Downloaded') {
    const sourceAssetsDir = resolveSourceChannelVideoDir(task.sourceId, task.videoId);
    if (!sourceAssetsDir) {
      throw new AppError('Downloaded source folder not found', 404, 'SOURCE_ASSETS_NOT_FOUND');
    }

    if (taskJobId) {
      taskQueueRepository.appendLogMessage(taskJobId, 'info', `Copying pre-downloaded source assets for ${task.videoId}...`);
    }

    await copySourceAssetsToDir(sourceAssetsDir, outputDir);
    const thumbnailPath = await findSourceThumbnailPath(outputDir);
    const transcriptPath = await findSourceTranscriptPath(outputDir);

    if (!thumbnailPath || !transcriptPath) {
      throw new AppError('Pre-downloaded source assets incomplete after copy', 500, 'SOURCE_ASSETS_INCOMPLETE');
    }

    return {
      youtubeVideoId: task.videoId,
      outputDir,
      thumbnailPath,
      audioPath: path.join(outputDir, 'audio.mp3'),
      transcriptPath,
    };
  }

  if (taskJobId) {
    taskQueueRepository.appendLogMessage(
      taskJobId,
      'info',
      `Downloading thumbnail + audio + transcript (${language}) for source video ${task.videoId}...`
    );
  }

  return downloadReupAudioAssets(task.link, language);
}

async function resolveReupVideoDownload(
  task: ReupVideoTask,
  pipelineType: ProductionDestination['pipelineType'],
  language: ChannelLanguage,
  taskJobId?: string
): Promise<ReupDownloadResult> {
  if (task.sourceStatus === 'Downloaded') {
    const outputDir = mediaDownloadDir('youtube', task.videoId);
    const sourceAssetsDir = resolveSourceChannelVideoDir(task.sourceId, task.videoId);
    if (!sourceAssetsDir) {
      throw new AppError('Downloaded source folder not found', 404, 'SOURCE_ASSETS_NOT_FOUND');
    }

    if (taskJobId) {
      taskQueueRepository.appendLogMessage(taskJobId, 'info', `Copying pre-downloaded source assets for ${task.videoId}...`);
    }

    await copySourceAssetsToDir(sourceAssetsDir, outputDir);

    const videoPath = path.join(outputDir, 'video.mp4');
    try {
      await fs.access(videoPath);
      return {
        youtubeVideoId: task.videoId,
        outputDir,
        primaryPath: videoPath,
        videoPath,
      };
    } catch {
      if (taskJobId) {
        taskQueueRepository.appendLogMessage(taskJobId, 'info', `Downloading video file for ${task.videoId}...`);
      }

      const downloadedVideoPath = await downloadYoutubeVideo(task.link, outputDir, {
        quality: 'best',
        outputBasename: 'video',
      });

      return {
        youtubeVideoId: task.videoId,
        outputDir,
        primaryPath: downloadedVideoPath,
        videoPath: downloadedVideoPath,
      };
    }
  }

  if (taskJobId) {
    taskQueueRepository.appendLogMessage(taskJobId, 'info', `Downloading source video ${task.videoId}...`);
  }

  return downloadReupAssets(task.link, pipelineType, language);
}

function buildTasks(destination: ProductionDestination, videos: SourceVideoWithSource[], maxVideos?: number): ReupVideoTask[] {
  const preparedVideoIds = destination.getPreparedVideoIds();
  const limit = maxVideos ?? REUP_VIDEOS_PER_RUN;
  const selected = selectVideosTopDown(videos, preparedVideoIds, limit);

  return selected.map(video => ({
    link: video.url,
    id: destination.id,
    language: destination.language,
    videoId: video.id,
    sourceId: video.sourceId,
    sourceTitle: video.title?.trim() || video.id,
    sourceStatus: video.status,
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

    const tasks = buildTasks(destination, allVideos, options?.maxVideosPerChannel);
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    destination.ensurePrepareStore();

    const items: ReupVideoOutputItem[] = [];
    const isAudioChannel = isReupAudioPipeline(destination.pipelineType);

    for (const task of tasks) {
      const taskJobId = options?.taskJobId;
      const stepTimer = createStepTimer(taskJobId, task.videoId);

      try {
        let outputItem: ReupVideoOutputItem;

        if (isAudioChannel) {
          if (taskJobId) {
            taskQueueRepository.setLivePhase(taskJobId, 'downloading');
          }

          const downloaded = await resolveReupAudioDownload(task, destination.language, taskJobId);
          const videoType = destination.reupAudioVideoType as ReupAudioVideoType;

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Source thumbnail saved → ${downloaded.thumbnailPath}`);
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Audio saved → ${downloaded.audioPath}`);
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Transcript saved → ${downloaded.transcriptPath}`);
          }

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Cleaning transcript → SRT...');
          }

          const srtPath = await timedStep('Làm sạch SRT', () => cleanSrt(downloaded.transcriptPath), stepTimer);

          if (taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'ok', `SRT cleaned → ${srtPath}`);
          }

          let updatedSrtPath: string | undefined;
          let videoMetaOutput: VideoMetaOutput | undefined;
          let thumbnailHorizontalOutput: ThumbnailHorizontalOutput | undefined;
          let heroImagePath: string | undefined;
          let thumbnailVisualPath: string | undefined;
          let reupThumbnailPath: string | undefined;
          let reupVideoPath: string | undefined;
          let aiScenePrompts: AiVideoScenePrompt[] | undefined;
          let primaryOutputPath = downloaded.audioPath;
          let subtitleForAssembly: string | undefined = srtPath;
          if (destination.language === 'ja') {
            // TEMP: skip LLM transcript update — testing metadata only
            /*
            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'info', `Updating transcript via LLM (${destination.language})...`);
            }

            updatedSrtPath = await timedStep(
              'Cập nhật transcript (LLM)',
              () =>
                updateTranscriptWithLlm(srtPath, destination.language as TranscriptLanguage, {
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

                        taskQueueRepository.appendLogMessage(taskJobId, 'ok', `LLM batch ${label} on ${profileLabel} done`);
                      }
                    : undefined,
                }),
              stepTimer,
            );

            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'ok', `Transcript saved → transcript.srt`);
            }
            */
            updatedSrtPath = srtPath;
            if (taskJobId) {
              taskQueueRepository.appendLogMessage(taskJobId, 'info', 'LLM transcript update skipped (temp, testing metadata)');
            }

            const jaSrtPath = updatedSrtPath;
            const jaWorkDir = path.dirname(jaSrtPath);

            subtitleForAssembly = updatedSrtPath;

            if (videoType === 'si') {
              if (taskJobId) {
                taskQueueRepository.setLivePhase(taskJobId, 'metadata');
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating metadata...');
              }

              videoMetaOutput = await timedStep(
                'Metadata',
                () =>
                  runMetadata(task.sourceTitle, jaSrtPath, destination.language, downloaded.youtubeVideoId, {
                    outputDir: jaWorkDir,
                    onProgress: taskJobId
                      ? progress => {
                          const profileLabel = progress.profileName;

                          if (progress.status === 'retry') {
                            taskQueueRepository.appendLogMessage(
                              taskJobId,
                              'info',
                              `Metadata on ${profileLabel} retry (attempt ${progress.attempt})...`
                            );
                            return;
                          }

                          taskQueueRepository.appendLogMessage(
                            taskJobId,
                            'info',
                            `Metadata on ${profileLabel} (attempt ${progress.attempt})...`
                          );
                        }
                      : undefined,
                  }),
                stepTimer
              );

              if (taskJobId) {
                const videoMetaPath = path.join(jaWorkDir, 'video-meta.json');
                taskQueueRepository.appendLogMessage(
                  taskJobId,
                  'ok',
                  `Metadata done → ${videoMetaPath}, title: ${videoMetaOutput.metadata.title}, niche: ${
                    videoMetaOutput.detected_niche ?? 'n/a'
                  }`
                );
              }

              const workDir = jaWorkDir;
              const styleKey = resolveThumbnailStyleKey(destination.thumbnailStyleKey, destination.language);
              let useHorizontalFlow = false;

              if (styleKey === 'thumbnail_default') {
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating thumbnail via Flow (thumbnail_default)...');
                }

                try {
                  const defaultResult = await timedStep(
                    'Thumbnail Flow (thumbnail_default)',
                    () =>
                      runDefaultFlowThumbnail(workDir, destination.language, {
                        referenceImagePath: downloaded.thumbnailPath,
                        onProgress: taskJobId
                          ? progress => {
                              const profileLabel = progress.profileName;
                              if (progress.status === 'retry') {
                                taskQueueRepository.appendLogMessage(
                                  taskJobId,
                                  'info',
                                  `Thumbnail on ${profileLabel} retry (attempt ${progress.attempt})...`
                                );
                                return;
                              }
                              taskQueueRepository.appendLogMessage(
                                taskJobId,
                                'info',
                                `Thumbnail on ${profileLabel} (attempt ${progress.attempt})...`
                              );
                            }
                          : undefined,
                      }),
                    stepTimer
                  );
                  reupThumbnailPath = defaultResult.thumbnailPath;

                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Thumbnail saved → thumbnail.jpg');
                  }
                } catch (err) {
                  const message =
                    err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail generation failed';
                  console.warn(`[reup-video] default flow thumbnail skipped (non-fatal): ${message}`);
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail skipped: ${message}`);
                  }
                }
              } else if (hasLegacyVisualMeta(videoMetaOutput)) {
                const metaOutput: MetaStep3Output = videoMetaOutput;
                useHorizontalFlow = styleKey ? isHorizontalMultiStepStyle(styleKey, destination.language) : false;

                if (useHorizontalFlow && styleKey) {
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating horizontal thumbnail (LLM step 1/2/3)...');
                  }

                  try {
                    thumbnailHorizontalOutput = await timedStep(
                      'Thumbnail ngang (LLM 3 bước)',
                      () =>
                        runThumbnailHorizontal(metaOutput, destination.language, styleKey, {
                          onProgress: taskJobId
                            ? progress => {
                                const profileLabel = progress.profileName;
                                const stepLabel = `step ${progress.step}/3`;

                                if (progress.status === 'retry') {
                                  taskQueueRepository.appendLogMessage(
                                    taskJobId,
                                    'info',
                                    `Thumbnail ${stepLabel} on ${profileLabel} retry (attempt ${progress.attempt})...`
                                  );
                                  return;
                                }

                                taskQueueRepository.appendLogMessage(
                                  taskJobId,
                                  'info',
                                  `Thumbnail ${stepLabel} on ${profileLabel} (attempt ${progress.attempt})...`
                                );
                              }
                            : undefined,
                        }),
                      stepTimer
                    );

                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Horizontal thumbnail LLM done');
                    }
                  } catch (err) {
                    const message =
                      err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail generation failed';
                    console.warn(`[reup-video] thumbnail LLM skipped (non-fatal): ${message}`);
                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail LLM skipped: ${message}`);
                    }
                  }
                } else if (styleKey) {
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', `Creating thumbnail via Flow (${styleKey})...`);
                  }

                  try {
                    const directResult = await timedStep(
                      `Thumbnail Flow (${styleKey})`,
                      () =>
                        runDirectFlowThumbnail(metaOutput, destination.language, styleKey, workDir, {
                          onProgress: taskJobId
                            ? progress => {
                                const profileLabel = progress.profileName;
                                if (progress.status === 'retry') {
                                  taskQueueRepository.appendLogMessage(
                                    taskJobId,
                                    'info',
                                    `Thumbnail on ${profileLabel} retry (attempt ${progress.attempt})...`
                                  );
                                  return;
                                }
                                taskQueueRepository.appendLogMessage(
                                  taskJobId,
                                  'info',
                                  `Thumbnail on ${profileLabel} (attempt ${progress.attempt})...`
                                );
                              }
                            : undefined,
                        }),
                      stepTimer
                    );
                    reupThumbnailPath = directResult.thumbnailPath;

                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Thumbnail saved → thumbnail.jpg');
                    }
                  } catch (err) {
                    const message =
                      err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail generation failed';
                    console.warn(`[reup-video] direct flow thumbnail skipped (non-fatal): ${message}`);
                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail skipped: ${message}`);
                    }
                  }
                }

                if (useHorizontalFlow && thumbnailHorizontalOutput) {
                  if (taskJobId) {
                    taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Generating thumbnail visual with Google Flow...');
                  }

                  try {
                    const visualResult = await timedStep(
                      'Thumbnail visual (Google Flow)',
                      () =>
                        runThumbnailVisualGeneration(
                          workDir,
                          {
                            visualPrompt: thumbnailHorizontalOutput!.plan.visualPrompt,
                            negativePrompt: thumbnailHorizontalOutput!.plan.negativePrompt,
                          },
                          {
                            onProgress: taskJobId
                              ? progress => {
                                  const profileLabel = progress.profileName;
                                  if (progress.status === 'retry') {
                                    taskQueueRepository.appendLogMessage(
                                      taskJobId,
                                      'info',
                                      `Thumbnail visual on ${profileLabel} retry (attempt ${progress.attempt})...`
                                    );
                                    return;
                                  }
                                  taskQueueRepository.appendLogMessage(
                                    taskJobId,
                                    'info',
                                    `Thumbnail visual on ${profileLabel} (attempt ${progress.attempt})...`
                                  );
                                }
                              : undefined,
                          }
                        ),
                      stepTimer
                    );
                    thumbnailVisualPath = visualResult.thumbnailVisualPath;

                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Thumbnail visual saved → thumbnail_visual.jpg');
                    }
                  } catch (err) {
                    const message =
                      err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail visual generation failed';
                    console.warn(`[reup-video] thumbnail visual skipped (non-fatal): ${message}`);
                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail visual skipped: ${message}`);
                    }
                  }

                  if (thumbnailVisualPath) {
                    if (taskJobId) {
                      taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Compositing horizontal thumbnail (canvas)...');
                    }

                    const horizontalOutput = thumbnailHorizontalOutput;
                    const visualPath = thumbnailVisualPath;

                    try {
                      const compositeOutPath = path.join(workDir, 'thumbnail.jpg');
                      reupThumbnailPath = await timedStep(
                        'Composite thumbnail',
                        () =>
                          renderThumbnailHorizontalFlowCompositeToPath({
                            backgroundImagePath: visualPath,
                            flowLayout: {
                              thumbnail_copy: horizontalOutput.plan.thumbnailCopy,
                              color_strategy: horizontalOutput.plan.colorStrategy,
                            },
                            outPath: compositeOutPath,
                          }),
                        stepTimer
                      );

                      if (taskJobId) {
                        taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'Thumbnail composite saved → thumbnail.jpg');
                      }
                    } catch (err) {
                      const message =
                        err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Thumbnail composite failed';
                      console.warn(`[reup-video] thumbnail composite skipped (non-fatal): ${message}`);
                      if (taskJobId) {
                        taskQueueRepository.appendLogMessage(taskJobId, 'info', `Thumbnail composite skipped: ${message}`);
                      }
                    }
                  }
                }
              }

              if (!videoMetaOutput) {
                throw new AppError('Metadata is required for SI general image', 400, 'INVALID_INPUT');
              }

              const generalImageTitle = String(videoMetaOutput.metadata.title ?? '').trim();
              if (!generalImageTitle) {
                throw new AppError('Metadata title is required for general image', 400, 'INVALID_INPUT');
              }

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Creating general image via Flow (general + reference)...');
              }

              const heroResult = await timedStep(
                'General image (Flow + reference)',
                () =>
                  runGeneralImage(generalImageTitle, destination.language, workDir, {
                    referenceImagePath: downloaded.thumbnailPath,
                    onProgress: taskJobId
                      ? progress => {
                          const profileLabel = progress.profileName;
                          if (progress.status === 'retry') {
                            taskQueueRepository.appendLogMessage(
                              taskJobId,
                              'info',
                              `General image on ${profileLabel} retry (attempt ${progress.attempt})...`
                            );
                            return;
                          }
                          taskQueueRepository.appendLogMessage(
                            taskJobId,
                            'info',
                            `General image on ${profileLabel} (attempt ${progress.attempt})...`
                          );
                        }
                      : undefined,
                  }),
                stepTimer
              );
              heroImagePath = heroResult.heroImagePath;

              const flowDebugPath = path.join(workDir, 'flow-debug.png');
              await fs.unlink(flowDebugPath).catch(() => undefined);

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(taskJobId, 'ok', 'General image saved → background.jpg');
              }
            }
          }

          const workDir = subtitleForAssembly ? path.dirname(subtitleForAssembly) : path.dirname(srtPath);

          if (!options?.skipVideoAssembly && downloaded.audioPath && subtitleForAssembly) {
            if (videoType === 'si') {
              if (!heroImagePath) {
                console.warn(`[reup-video] SI video assembly skipped: hero image not generated`);
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', 'SI video assembly skipped: hero image missing');
                }
              } else if (!destination.backgroundFootageSources?.length) {
                console.warn(`[reup-video] SI video assembly skipped: channel ${destination.id} has no backgroundFootageSources`);
                if (taskJobId) {
                  taskQueueRepository.appendLogMessage(
                    taskJobId,
                    'info',
                    'SI video assembly skipped: no backgroundFootageSources configured on channel'
                  );
                }
              } else {
                if (taskJobId) {
                  taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg');
                  taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Assembling SI video (stock + overlay + subtitles)...');
                }

                reupVideoPath = await assembleReupSiVideo({
                  workDir,
                  audioPath: downloaded.audioPath,
                  subtitlePath: subtitleForAssembly,
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
            } else if (videoType === 'ai') {
              if (!destination.visualStyle) {
                throw new AppError('Reup Audio AI channel is missing visual style', 400, 'VALIDATION_ERROR');
              }

              if (!subtitleForAssembly) {
                throw new AppError('Subtitle is required for AI scene prompt generation', 400, 'INVALID_INPUT');
              }

              if (taskJobId) {
                taskQueueRepository.setLivePhase(taskJobId, 'metadata');
                taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Generating AI scene prompts via LLM...');
              }

              aiScenePrompts = await generateAiVideoImages({
                workDir,
                youtubeVideoId: downloaded.youtubeVideoId,
                visualStyle: destination.visualStyle,
                subtitlePath: subtitleForAssembly,
                audioPath: downloaded.audioPath,
                language: destination.language,
                onLog: taskJobId ? msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg) : undefined,
                onProgress: taskJobId
                  ? progress =>
                      taskQueueRepository.appendLogMessage(
                        taskJobId,
                        'info',
                        `AI scene prompts ${progress.density} chunk ${progress.chunkIndex + 1}/${progress.totalChunks} (attempt ${progress.attempt})...`
                      )
                  : undefined,
              });

              if (taskJobId) {
                taskQueueRepository.appendLogMessage(
                  taskJobId,
                  'info',
                  `AI video assembly skipped — scene prompts only (${aiScenePrompts.length} scene(s))`
                );
              }
            }
          } else if (options?.skipVideoAssembly && taskJobId) {
            taskQueueRepository.appendLogMessage(taskJobId, 'info', 'Video assembly skipped (prepare-only mode)');
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
            ...(subtitleForAssembly
              ? {
                  updatedSrtPath: subtitleForAssembly,
                  ...(videoMetaOutput ? { videoMetaOutput } : {}),
                  ...(thumbnailHorizontalOutput ? { thumbnailHorizontalOutput } : {}),
                  ...(heroImagePath ? { heroImagePath } : {}),
                  ...(thumbnailVisualPath ? { thumbnailVisualPath } : {}),
                  ...(reupThumbnailPath ? { reupThumbnailPath } : {}),
                  ...(reupVideoPath ? { reupVideoPath } : {}),
                  ...(aiScenePrompts ? { aiScenePrompts } : {}),
                }
              : { transcriptPath: downloaded.transcriptPath, srtPath }),
          };
        } else {
          if (taskJobId) {
            taskQueueRepository.setLivePhase(taskJobId, 'downloading');
          }

          const downloaded = await timedStep(
            'Tải source video',
            () => resolveReupVideoDownload(task, destination.pipelineType, destination.language, taskJobId),
            stepTimer
          );

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
        const destDir = await timedStep(
          'Di chuyển thư mục video',
          () => moveVideoFolderToDestination('youtube', outputItem.youtubeVideoId, expectedDestDir),
          stepTimer
        );
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
