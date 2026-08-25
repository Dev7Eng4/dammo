import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import type { TimedStepOptions } from '../../../../shared/timing/step-timer.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { resolveChannelAvatarForVideoAssembly } from '../../../youtube-channels/resolve-channel-avatar.js';
import type { ReupAudioVideoType } from '../../../youtube-channels/youtube-channels.types.js';
import { sanitizeVideoOutputBasename } from '../../shared/render-core/video-output-file.js';
import { sourceCatalogAdapter } from '../../adapters/source-catalog.adapter.js';
import type { ProductionDestination } from '../../ports/production-destination.port.js';
import type { SourceCatalog } from '../../ports/source-catalog.port.js';
import { taskQueueRepository } from '../../../task-queue/task-queue.repository.js';
import {
  CREATE_VIDEO_STAGE_IDS,
  completeCreateVideoStage,
  failCreateVideoStage,
  initCreateVideoStages,
  skipCreateVideoStage,
  startCreateVideoStage,
} from '../../../task-queue/task-stage.js';
import { resolveReupAudioDownload, resolveReupVideoDownload } from './steps/download.step.js';
import { runFinalizeStep } from './steps/finalize.step.js';
import { runMetadataStep } from './steps/metadata.step.js';
import { buildTasks, collectSourceVideos } from './steps/task-selection.js';
import { runThumbnailStep } from './steps/thumbnail.step.js';
import { runCleanTranscript, runUpdateTranscript } from './steps/transcript.step.js';
import { resolveVideoTypeStrategy, type VisualAssets } from './strategies/index.js';
import { createTaskLogger, type TaskLogger } from './task-logger.js';
import { buildAssembleContext, type StepTimerOptions, type VideoTaskContext } from './video-task.context.js';
import type { CreateReupVideosResult, ReupVideoOutputItem, ReupVideoTask } from './reup-audio.types.js';

interface CreateVideosOptions {
  taskJobId?: string;
  skipLivePhaseDone?: boolean;
  /** Khi true: bỏ qua bước assemble, video sẽ ở status Prepared */
  skipVideoAssembly?: boolean;
  /** Số video tối đa xử lý trên mỗi channel trong một lần chạy */
  maxVideosPerChannel?: number;
  /** Danh sách source video ID cụ thể cần xử lý (bỏ qua auto-pick) */
  videoIds?: string[];
}

interface TaskRunContext {
  taskJobId?: string;
  log: TaskLogger;
  stepTimer: StepTimerOptions;
  skipVideoAssembly: boolean;
}

function isReupAudioPipeline(pipelineType: ProductionDestination['pipelineType']): boolean {
  return pipelineType === 'reup_audio';
}

function createStepTimer(taskJobId: string | undefined, videoId: string): Pick<TimedStepOptions, 'prefix' | 'onLog'> {
  return {
    prefix: `[reup-video] ${videoId}`,
    onLog: taskJobId ? msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg) : undefined,
  };
}

/** The thumbnail stage stays `doing` when assembly follows; close it explicitly. */
function completeThumbnailStageIfRunning(taskJobId: string | undefined): void {
  if (!taskJobId) return;
  const stages = taskQueueRepository.findById(taskJobId)?.stages;
  if (stages?.find(stage => stage.id === CREATE_VIDEO_STAGE_IDS.thumbnail)?.status === 'doing') {
    completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);
  }
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

    if (this.sourceCatalog.resolveSources(destination.sourceChannels).length === 0) {
      throw new AppError('No source channels matched source mapping', 400, 'SOURCE_NOT_FOUND');
    }

    const allVideos = collectSourceVideos(this.sourceCatalog, destination.sourceChannels);
    if (allVideos.length === 0) {
      throw new AppError('No source videos available for mapped sources', 400, 'NO_SOURCE_VIDEOS');
    }

    const tasks = buildTasks(destination, allVideos, {
      maxVideosPerChannel: options?.maxVideosPerChannel,
      videoIds: options?.videoIds,
    });
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    destination.ensurePrepareStore();

    const items: ReupVideoOutputItem[] = [];
    const isAudioChannel = isReupAudioPipeline(destination.pipelineType);

    for (const task of tasks) {
      const taskJobId = options?.taskJobId;
      const log = createTaskLogger(taskJobId);
      const run: TaskRunContext = {
        ...(taskJobId ? { taskJobId } : {}),
        log,
        stepTimer: createStepTimer(taskJobId, task.videoId),
        skipVideoAssembly: options?.skipVideoAssembly === true,
      };

      try {
        const outputItem = isAudioChannel
          ? await this.runAudioTask(destination, task, run)
          : await this.runVideoDownloadTask(destination, task, run);

        items.push(
          await runFinalizeStep(outputItem, destination, {
            skipVideoAssembly: run.skipVideoAssembly,
            log,
            stepTimer: run.stepTimer,
          }),
        );
      } catch (err) {
        this.logUnhandledTaskError(taskJobId, err);
        throw err;
      }
    }

    if (options?.taskJobId && !options.skipLivePhaseDone) {
      taskQueueRepository.setLivePhase(options.taskJobId, 'done');
    }

    return { items };
  }

  /** reup_video channels: download only, no transcript/metadata/assembly. */
  private async runVideoDownloadTask(
    destination: ProductionDestination,
    task: ReupVideoTask,
    run: TaskRunContext,
  ): Promise<ReupVideoOutputItem> {
    if (run.taskJobId) {
      taskQueueRepository.setLivePhase(run.taskJobId, 'downloading');
    }

    const downloaded = await timedStep(
      'Tải source video',
      () => resolveReupVideoDownload(task, destination.pipelineType, destination.language, run.log),
      run.stepTimer,
    );

    run.log.ok(`Video saved → ${downloaded.videoPath}`);

    return {
      link: task.link,
      channelId: destination.id,
      language: destination.language,
      videoId: task.videoId,
      youtubeVideoId: downloaded.youtubeVideoId,
      outputPath: downloaded.primaryPath,
      ...(downloaded.videoPath ? { videoPath: downloaded.videoPath } : {}),
    };
  }

  private async runAudioTask(
    destination: ProductionDestination,
    task: ReupVideoTask,
    run: TaskRunContext,
  ): Promise<ReupVideoOutputItem> {
    const { taskJobId, log, stepTimer } = run;
    let activeStageId: string | undefined = CREATE_VIDEO_STAGE_IDS.download;

    if (taskJobId) {
      initCreateVideoStages(taskJobId, {
        copyingAssets: task.sourceStatus === 'Downloaded',
        includeUpdateTranscript: destination.language === 'ja',
      });
      startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);
      taskQueueRepository.setLivePhase(taskJobId, 'downloading');
    }

    try {
      const downloaded = await resolveReupAudioDownload(task, destination.language, log);
      const videoType = destination.reupAudioVideoType as ReupAudioVideoType;
      const strategy = resolveVideoTypeStrategy(videoType);
      /* Only these two produce an mp4; anything else stops after the transcript. */
      const isRenderable = videoType === 'si' || videoType === 'ai';

      if (downloaded.thumbnailPath) {
        log.ok(`Source thumbnail saved → ${downloaded.thumbnailPath}`);
      }
      log.ok(`Audio saved → ${downloaded.audioPath}`);
      log.ok(`Transcript saved → ${downloaded.transcriptPath}`);
      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);

      activeStageId = CREATE_VIDEO_STAGE_IDS.cleanTranscript;
      startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);
      const srtPath = await runCleanTranscript(downloaded.transcriptPath, log, stepTimer);
      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);

      const ctx: VideoTaskContext = {
        destination,
        videoType,
        task,
        ...(taskJobId ? { taskJobId } : {}),
        log,
        stepTimer,
        workDir: path.dirname(srtPath),
        downloaded,
        subtitlePath: srtPath,
      };

      const assets: VisualAssets = {};
      let updatedSrtPath: string | undefined;
      let thumbnailHorizontalOutput: ReupVideoOutputItem['thumbnailHorizontalOutput'];
      let thumbnailVisualPath: string | undefined;

      /**
       * Only Japanese channels run the LLM transcript rewrite, and metadata +
       * thumbnail depend on that rewrite. Other languages skip straight to
       * assembly using the cleaned SRT and a fallback output basename.
       */
      const needsLlmEnrichment = destination.language === 'ja';

      if (needsLlmEnrichment) {
        activeStageId = CREATE_VIDEO_STAGE_IDS.updateTranscript;
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.updateTranscript);
        updatedSrtPath = await runUpdateTranscript(srtPath, destination.language, log, stepTimer);
        completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.updateTranscript);

        ctx.subtitlePath = updatedSrtPath;
        ctx.workDir = path.dirname(updatedSrtPath);

        if (isRenderable) {
          activeStageId = CREATE_VIDEO_STAGE_IDS.metadata;
          startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);
          if (taskJobId) taskQueueRepository.setLivePhase(taskJobId, 'metadata');
          ctx.videoMeta = await runMetadataStep(ctx);
          completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);

          activeStageId = CREATE_VIDEO_STAGE_IDS.thumbnail;
          startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);

          const thumbnail = await runThumbnailStep(ctx, strategy);
          Object.assign(assets, {
            ...(thumbnail.reupThumbnailPath ? { reupThumbnailPath: thumbnail.reupThumbnailPath } : {}),
            ...(thumbnail.heroImagePath ? { heroImagePath: thumbnail.heroImagePath } : {}),
          });
          thumbnailHorizontalOutput = thumbnail.thumbnailHorizontalOutput;
          thumbnailVisualPath = thumbnail.thumbnailVisualPath;

          Object.assign(assets, await strategy.prepareEnrichedVisuals(ctx, assets, thumbnail.flow));
        }
      } else {
        skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);
        skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);
      }

      if (isRenderable) {
        Object.assign(assets, await strategy.prepareSceneAssets(ctx));
      }

      let reupVideoPath: string | undefined;

      if (!run.skipVideoAssembly) {
        completeThumbnailStageIfRunning(taskJobId);
        activeStageId = CREATE_VIDEO_STAGE_IDS.assemble;
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);

        if (isRenderable) {
          reupVideoPath = await this.assemble(ctx, strategy, assets);
        }

        completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);
      } else {
        completeThumbnailStageIfRunning(taskJobId);
        if (isRenderable) {
          log.info('Video assembly skipped (prepare-only mode)');
        }
        skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);
      }

      return {
        link: task.link,
        channelId: destination.id,
        language: destination.language,
        videoId: task.videoId,
        youtubeVideoId: downloaded.youtubeVideoId,
        outputPath: reupVideoPath ?? downloaded.audioPath,
        thumbnailPath: downloaded.thumbnailPath,
        audioPath: downloaded.audioPath,
        updatedSrtPath: ctx.subtitlePath,
        ...(ctx.videoMeta ? { videoMetaOutput: ctx.videoMeta } : {}),
        ...(thumbnailHorizontalOutput ? { thumbnailHorizontalOutput } : {}),
        ...(assets.heroImagePath ? { heroImagePath: assets.heroImagePath } : {}),
        ...(thumbnailVisualPath ? { thumbnailVisualPath } : {}),
        ...(assets.reupThumbnailPath ? { reupThumbnailPath: assets.reupThumbnailPath } : {}),
        ...(reupVideoPath ? { reupVideoPath } : {}),
        ...(assets.aiScenePrompts ? { aiScenePrompts: assets.aiScenePrompts } : {}),
        ...(assets.aiScenePromptsPath ? { aiScenePromptsPath: assets.aiScenePromptsPath } : {}),
        ...(assets.aiSlidesDir ? { aiSlidesDir: assets.aiSlidesDir } : {}),
      };
    } catch (stageErr) {
      if (taskJobId && activeStageId) {
        failCreateVideoStage(taskJobId, activeStageId, stageErr);
      }
      throw stageErr;
    }
  }

  /** Returns the assembled mp4 path, or undefined when the strategy is not ready. */
  private async assemble(
    ctx: VideoTaskContext,
    strategy: ReturnType<typeof resolveVideoTypeStrategy>,
    assets: VisualAssets,
  ): Promise<string | undefined> {
    const { destination, taskJobId, log } = ctx;

    const channelAvatarPath = await resolveChannelAvatarForVideoAssembly(destination.id, {
      enabled: destination.showChannelAvatar,
      onLog: log.enabled ? msg => log.info(msg) : undefined,
    });

    const metaTitle = ctx.videoMeta?.metadata?.title;
    const assembleCtx = buildAssembleContext(ctx, {
      outputBasename: sanitizeVideoOutputBasename(typeof metaTitle === 'string' ? metaTitle : ''),
      ...(channelAvatarPath ? { channelAvatarPath } : {}),
      ...(taskJobId ? { beginRenderPhase: () => taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg') } : {}),
    });

    const readiness = await strategy.canAssemble(assembleCtx, assets);
    if (!readiness.ready) {
      log.info(readiness.reason);
      return undefined;
    }

    return strategy.assemble(assembleCtx, assets);
  }

  /** Stage failures already log; this only covers errors thrown outside a stage. */
  private logUnhandledTaskError(taskJobId: string | undefined, err: unknown): void {
    if (!taskJobId) return;

    const alreadyLogged = taskQueueRepository
      .findById(taskJobId)
      ?.stages?.some(stage => stage.status === 'failed');
    if (alreadyLogged) return;

    const message =
      err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Video processing failed';
    taskQueueRepository.appendLogMessage(taskJobId, 'err', message);

    const details = err instanceof AppError ? err.details : undefined;
    if (details && typeof details.snippet === 'string') {
      taskQueueRepository.appendLogMessage(taskJobId, 'err', `Response snippet: ${details.snippet}`);
    }
  }
}

export const reupAudioPipeline = new ReupAudioPipeline(sourceCatalogAdapter);
