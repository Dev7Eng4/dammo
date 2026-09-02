import fs from 'node:fs/promises';
import path from 'node:path';
import { recreateMetadataDir, resolveYoutubeChannelVideoDir } from '../../../../config/paths.js';
import { assertMediaFileComplete } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { downloadYoutubeTranscript } from '../../../../infrastructure/youtube/youtube-transcript-downloader.js';
import { downloadYoutubeThumbnail } from '../../../../infrastructure/youtube/youtube-thumbnail-downloader.js';
import { fetchYoutubeVideoTitle } from '../../../../infrastructure/youtube/youtube-video-title.js';
import { canonicalizeYoutubeVideoUrl, requireYoutubeVideoId } from '../../../../infrastructure/youtube/youtube-url.js';
import { AppError } from '../../../../shared/http/errors.js';
import type { TimedStepOptions } from '../../../../shared/timing/step-timer.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { resolveChannelAvatarForVideoAssembly } from '../../../youtube-channels/resolve-channel-avatar.js';
import { videoPrepareRepository } from '../../../youtube-channels/video-prepare.repository.js';
import type { ReupAudioVideoType } from '../../../youtube-channels/youtube-channels.types.js';
import { findOldThumbnailPath } from '../../../youtube-upload/upload-assets.js';
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
import {
  PREPARED_AUDIO_FILE,
  PREPARED_SUBTITLE_FILES,
  collectVisualAssetsFromDisk,
  findFirstExistingPath,
} from './steps/assemble-from-prepared.js';
import { resolveVideoTypeStrategy, type VisualAssets } from './strategies/index.js';
import { createTaskLogger, type TaskLogger } from './task-logger.js';
import { buildAssembleContext, type StepTimerOptions, type VideoTaskContext } from './video-task.context.js';
import type { CreateReupVideosResult, ReupVideoOutputItem, ReupVideoTask } from './reup-audio.types.js';
import { parseVideoMetaContent } from '../../shared/meta/metadata.types.js';
import { OUTPUT_VIDEO_BASENAME } from '../../shared/render-core/output-artifacts.constants.js';

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

interface RegenerateMetadataOptions {
  taskJobId?: string;
  videoIds: string[];
}

interface RecreateMetadataFromUrlOptions {
  videoUrl: string;
  taskJobId?: string;
}

interface AssemblePreparedOptions {
  taskJobId?: string;
  videoIds: string[];
}

interface TaskRunContext {
  taskJobId?: string;
  log: TaskLogger;
  stepTimer: StepTimerOptions;
  skipVideoAssembly: boolean;
}

const AUDIO_FILE = 'audio.mp3';
const SUBTITLE_FILES = ['transcript-updated.srt', 'transcript.srt'] as const;

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

async function findFirstExisting(...paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
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

    const { tasks, targetCount } = buildTasks(destination, allVideos, {
      maxVideosPerChannel: options?.maxVideosPerChannel,
      videoIds: options?.videoIds,
    });
    if (tasks.length === 0) {
      throw new AppError('No unprocessed source videos available', 400, 'NO_UNPROCESSED_VIDEOS');
    }

    destination.ensurePrepareStore();

    const items: ReupVideoOutputItem[] = [];
    const isAudioChannel = isReupAudioPipeline(destination.pipelineType);
    const failFast = Boolean(options?.videoIds?.length);

    for (const task of tasks) {
      if (items.length >= targetCount) break;

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
        if (failFast) throw err;

        const detail = err instanceof Error ? err.message : String(err);
        log.err(`Video ${task.videoId} failed, trying next buffer candidate: ${detail}`);
      }
    }

    if (items.length === 0) {
      throw new AppError(
        'No videos were created successfully',
        500,
        'NO_VIDEOS_CREATED',
      );
    }

    if (options?.taskJobId && !options.skipLivePhaseDone) {
      taskQueueRepository.setLivePhase(options.taskJobId, 'done');
    }

    return { items };
  }

  /**
   * Re-run metadata + thumbnail only against an existing Prepared/Created video folder.
   * Skips download, transcript rewrite, and assembly.
   */
  async regenerateMetadataAndThumbnails(
    destination: ProductionDestination,
    options: RegenerateMetadataOptions,
  ): Promise<CreateReupVideosResult> {
    if (!isReupAudioPipeline(destination.pipelineType) && destination.pipelineType !== 'reup') {
      throw new AppError('Pipeline only supports reup audio channels', 400, 'INVALID_CHANNEL_TYPE');
    }

    if (destination.language !== 'ja') {
      throw new AppError(
        'Regenerate metadata is only supported for Japanese channels',
        400,
        'UNSUPPORTED_LANGUAGE',
      );
    }

    const videoType = destination.reupAudioVideoType as ReupAudioVideoType;
    if (videoType !== 'si' && videoType !== 'ai') {
      throw new AppError(
        'Regenerate metadata requires reupAudioVideoType si or ai',
        400,
        'INVALID_VIDEO_TYPE',
      );
    }

    const videoIds = [...new Set(options.videoIds.map(id => id.trim()).filter(Boolean))];
    if (videoIds.length === 0) {
      throw new AppError('No video IDs provided', 400, 'NO_VIDEO_IDS');
    }

    const items: ReupVideoOutputItem[] = [];
    const taskJobId = options.taskJobId;

    for (const videoId of videoIds) {
      const log = createTaskLogger(taskJobId);
      const stepTimer = createStepTimer(taskJobId, videoId);
      let activeStageId: string | undefined = CREATE_VIDEO_STAGE_IDS.metadata;

      try {
        const prepareItem = videoPrepareRepository
          .read(destination.id)
          .find(
            item =>
              item.videoId.trim() === videoId &&
              (item.status === 'Prepared' || item.status === 'Created'),
          );
        if (!prepareItem) {
          throw new AppError(
            'Video is not in Prepared or Created status',
            409,
            'VIDEO_NOT_VIEWABLE',
          );
        }

        const workDir = resolveYoutubeChannelVideoDir(destination.id, videoId);
        if (!workDir) {
          throw new AppError('Video folder not found', 404, 'VIDEO_FOLDER_NOT_FOUND');
        }

        const audioPath = path.join(workDir, AUDIO_FILE);
        try {
          await fs.access(audioPath);
        } catch {
          throw new AppError(`Missing audio.mp3 in video folder`, 404, 'AUDIO_NOT_FOUND');
        }
        await assertMediaFileComplete(audioPath, { label: AUDIO_FILE });

        const subtitlePath = await findFirstExisting(
          ...SUBTITLE_FILES.map(name => path.join(workDir, name)),
        );
        if (!subtitlePath) {
          throw new AppError(
            'Missing transcript.srt or transcript-updated.srt',
            404,
            'TRANSCRIPT_NOT_FOUND',
          );
        }

        const oldThumbnailPath = findOldThumbnailPath(workDir) ?? undefined;

        if (taskJobId) {
          initCreateVideoStages(taskJobId, {
            includeUpdateTranscript: true,
          });
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.updateTranscript);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);
          taskQueueRepository.setLivePhase(taskJobId, 'metadata');
        }

        const task: ReupVideoTask = {
          link: `https://www.youtube.com/watch?v=${videoId}`,
          id: prepareItem.id,
          language: destination.language,
          videoId,
          sourceId: '',
          sourceTitle: prepareItem.title.trim() || videoId,
        };

        const strategy = resolveVideoTypeStrategy(videoType);
        const ctx: VideoTaskContext = {
          destination,
          videoType,
          task,
          ...(taskJobId ? { taskJobId } : {}),
          log,
          stepTimer,
          workDir,
          downloaded: {
            youtubeVideoId: videoId,
            outputDir: workDir,
            audioPath,
            transcriptPath: subtitlePath,
            ...(oldThumbnailPath ? { thumbnailPath: oldThumbnailPath } : {}),
          },
          subtitlePath,
        };

        activeStageId = CREATE_VIDEO_STAGE_IDS.metadata;
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);
        ctx.videoMeta = await runMetadataStep(ctx);
        completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);

        const newTitle =
          typeof ctx.videoMeta.metadata.title === 'string' ? ctx.videoMeta.metadata.title.trim() : '';
        if (newTitle) {
          videoPrepareRepository.updateTitle(destination.id, videoId, newTitle);
        }

        activeStageId = CREATE_VIDEO_STAGE_IDS.thumbnail;
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);

        const assets: VisualAssets = {};
        const thumbnail = await runThumbnailStep(ctx, strategy);
        Object.assign(assets, {
          ...(thumbnail.reupThumbnailPath ? { reupThumbnailPath: thumbnail.reupThumbnailPath } : {}),
          ...(thumbnail.heroImagePath ? { heroImagePath: thumbnail.heroImagePath } : {}),
        });
        Object.assign(assets, await strategy.prepareEnrichedVisuals(ctx, assets, thumbnail.flow));
        completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);

        log.ok(`Regenerated metadata + thumbnail for ${videoId}`);

        items.push({
          link: task.link,
          channelId: destination.id,
          language: destination.language,
          videoId,
          youtubeVideoId: videoId,
          outputPath: workDir,
          audioPath,
          updatedSrtPath: subtitlePath,
          videoMetaOutput: ctx.videoMeta,
          ...(oldThumbnailPath ? { thumbnailPath: oldThumbnailPath } : {}),
          ...(assets.heroImagePath ? { heroImagePath: assets.heroImagePath } : {}),
          ...(assets.reupThumbnailPath ? { reupThumbnailPath: assets.reupThumbnailPath } : {}),
        });
      } catch (err) {
        if (taskJobId && activeStageId) {
          failCreateVideoStage(taskJobId, activeStageId, err);
        }
        this.logUnhandledTaskError(taskJobId, err);
        throw err;
      }
    }

    if (taskJobId) {
      taskQueueRepository.setLivePhase(taskJobId, 'done');
    }

    return { items };
  }

  /**
   * Download transcript from an external YouTube URL and regenerate metadata + thumbnail
   * into media-downloads/youtube/recreate-metadata (ephemeral flat folder).
   */
  async recreateMetadataFromUrl(
    destination: ProductionDestination,
    options: RecreateMetadataFromUrlOptions,
  ): Promise<CreateReupVideosResult> {
    if (!isReupAudioPipeline(destination.pipelineType) && destination.pipelineType !== 'reup') {
      throw new AppError('Pipeline only supports reup audio channels', 400, 'INVALID_CHANNEL_TYPE');
    }

    if (destination.language !== 'ja') {
      throw new AppError(
        'Recreate metadata from URL is only supported for Japanese channels',
        400,
        'UNSUPPORTED_LANGUAGE',
      );
    }

    const videoType = destination.reupAudioVideoType as ReupAudioVideoType;
    if (videoType !== 'si' && videoType !== 'ai') {
      throw new AppError(
        'Recreate metadata from URL requires reupAudioVideoType si or ai',
        400,
        'INVALID_VIDEO_TYPE',
      );
    }

    const trimmedVideoUrl = options.videoUrl.trim();
    if (!trimmedVideoUrl) {
      throw new AppError('Video URL is required', 400, 'INVALID_VIDEO_URL');
    }

    const videoUrl = canonicalizeYoutubeVideoUrl(trimmedVideoUrl);
    const youtubeVideoId = requireYoutubeVideoId(videoUrl);
    const taskJobId = options.taskJobId;
    const log = createTaskLogger(taskJobId);
    const stepTimer = createStepTimer(taskJobId, youtubeVideoId);
    let activeStageId: string | undefined = CREATE_VIDEO_STAGE_IDS.download;

    try {
      const workDir = recreateMetadataDir();
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });

      if (taskJobId) {
        initCreateVideoStages(taskJobId, { includeUpdateTranscript: false });
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);
        taskQueueRepository.setLivePhase(taskJobId, 'downloading');
      }

      log.info('Downloading transcript...');
      const transcriptPath = await timedStep(
        'Tải transcript',
        () => downloadYoutubeTranscript(videoUrl, workDir, destination.language),
        stepTimer,
      );
      log.ok(`Transcript saved → ${transcriptPath}`);

      const sourceTitle = await timedStep(
        'Lấy tiêu đề video',
        () => fetchYoutubeVideoTitle(videoUrl),
        stepTimer,
      );
      log.ok(`Source title → ${sourceTitle}`);

      let thumbnailPath: string | undefined;
      try {
        thumbnailPath = await downloadYoutubeThumbnail(videoUrl, workDir, {
          outputBasename: 'old-thumbnail',
        });
        log.ok(`Source thumbnail saved → ${thumbnailPath}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'thumbnail download failed';
        log.info(`Source thumbnail skipped (non-fatal): ${message}`);
      }

      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);

      activeStageId = CREATE_VIDEO_STAGE_IDS.cleanTranscript;
      startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);
      const srtPath = await runCleanTranscript(transcriptPath, log, stepTimer);
      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);

      skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.updateTranscript);
      skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);

      const task: ReupVideoTask = {
        link: videoUrl,
        id: destination.id,
        language: destination.language,
        videoId: youtubeVideoId,
        sourceId: '',
        sourceTitle,
      };

      const strategy = resolveVideoTypeStrategy(videoType);
      const ctx: VideoTaskContext = {
        destination,
        videoType,
        task,
        ...(taskJobId ? { taskJobId } : {}),
        log,
        stepTimer,
        workDir,
        downloaded: {
          youtubeVideoId,
          outputDir: workDir,
          audioPath: path.join(workDir, AUDIO_FILE),
          transcriptPath,
          ...(thumbnailPath ? { thumbnailPath } : {}),
        },
        subtitlePath: srtPath,
      };

      activeStageId = CREATE_VIDEO_STAGE_IDS.metadata;
      startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);
      if (taskJobId) taskQueueRepository.setLivePhase(taskJobId, 'metadata');
      ctx.videoMeta = await runMetadataStep(ctx);
      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);

      activeStageId = CREATE_VIDEO_STAGE_IDS.thumbnail;
      startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);

      const assets: VisualAssets = {};
      const thumbnail = await runThumbnailStep(ctx, strategy);
      Object.assign(assets, {
        ...(thumbnail.reupThumbnailPath ? { reupThumbnailPath: thumbnail.reupThumbnailPath } : {}),
        ...(thumbnail.heroImagePath ? { heroImagePath: thumbnail.heroImagePath } : {}),
      });
      Object.assign(assets, await strategy.prepareEnrichedVisuals(ctx, assets, thumbnail.flow));
      completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);

      log.ok(`Recreate metadata done for ${youtubeVideoId}`);

      if (taskJobId) {
        taskQueueRepository.setLivePhase(taskJobId, 'done');
      }

      return {
        items: [
          {
            link: videoUrl,
            channelId: destination.id,
            language: destination.language,
            videoId: youtubeVideoId,
            youtubeVideoId,
            outputPath: workDir,
            transcriptPath,
            updatedSrtPath: srtPath,
            videoMetaOutput: ctx.videoMeta,
            ...(thumbnailPath ? { thumbnailPath } : {}),
            ...(assets.heroImagePath ? { heroImagePath: assets.heroImagePath } : {}),
            ...(assets.reupThumbnailPath ? { reupThumbnailPath: assets.reupThumbnailPath } : {}),
          },
        ],
      };
    } catch (err) {
      if (taskJobId && activeStageId) {
        failCreateVideoStage(taskJobId, activeStageId, err);
      }
      this.logUnhandledTaskError(taskJobId, err);
      throw err;
    }
  }

  /**
   * Assemble final mp4 only for existing Prepared videos.
   * Skips download, transcript, metadata, and thumbnail.
   */
  async assemblePreparedVideos(
    destination: ProductionDestination,
    options: AssemblePreparedOptions,
  ): Promise<CreateReupVideosResult> {
    if (!isReupAudioPipeline(destination.pipelineType) && destination.pipelineType !== 'reup') {
      throw new AppError('Pipeline only supports reup audio channels', 400, 'INVALID_CHANNEL_TYPE');
    }

    const videoType = destination.reupAudioVideoType as ReupAudioVideoType;
    if (videoType !== 'si' && videoType !== 'ai') {
      throw new AppError(
        'Assemble prepared videos requires reupAudioVideoType si or ai',
        400,
        'INVALID_VIDEO_TYPE',
      );
    }

    const videoIds = [...new Set(options.videoIds.map(id => id.trim()).filter(Boolean))];
    if (videoIds.length === 0) {
      throw new AppError('No video IDs provided', 400, 'NO_VIDEO_IDS');
    }

    const items: ReupVideoOutputItem[] = [];
    const taskJobId = options.taskJobId;
    const strategy = resolveVideoTypeStrategy(videoType);
    const backgroundImage = destination.reupAudioBackgroundImage ?? 'one_image';

    for (const videoId of videoIds) {
      const log = createTaskLogger(taskJobId);
      const stepTimer = createStepTimer(taskJobId, videoId);
      let activeStageId: string | undefined = CREATE_VIDEO_STAGE_IDS.assemble;

      try {
        const prepareItem = videoPrepareRepository
          .read(destination.id)
          .find(item => item.videoId.trim() === videoId && item.status === 'Prepared');
        if (!prepareItem) {
          throw new AppError('Video is not in Prepared status', 409, 'VIDEO_NOT_PREPARED');
        }

        const workDir = resolveYoutubeChannelVideoDir(destination.id, videoId);
        if (!workDir) {
          throw new AppError('Video folder not found', 404, 'VIDEO_FOLDER_NOT_FOUND');
        }

        const audioPath = path.join(workDir, PREPARED_AUDIO_FILE);
        try {
          await fs.access(audioPath);
        } catch {
          throw new AppError('Missing audio.mp3 in video folder', 404, 'AUDIO_NOT_FOUND');
        }
        await assertMediaFileComplete(audioPath, { label: PREPARED_AUDIO_FILE });

        const subtitlePath = await findFirstExistingPath(
          ...PREPARED_SUBTITLE_FILES.map(name => path.join(workDir, name)),
        );
        if (!subtitlePath) {
          throw new AppError(
            'Missing transcript.srt or transcript-updated.srt',
            404,
            'TRANSCRIPT_NOT_FOUND',
          );
        }

        const fromDisk = await collectVisualAssetsFromDisk(workDir, videoType, backgroundImage);
        if (fromDisk.missingFiles.length > 0) {
          throw new AppError(
            `Missing files: ${fromDisk.missingFiles.join(', ')}`,
            404,
            'ASSETS_NOT_FOUND',
            { missingFields: fromDisk.missingFiles },
          );
        }

        if (taskJobId) {
          initCreateVideoStages(taskJobId, { includeUpdateTranscript: true });
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.download);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.cleanTranscript);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.updateTranscript);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.metadata);
          skipCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.thumbnail);
          taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg');
        }

        let metaTitle =
          typeof prepareItem.title === 'string' ? prepareItem.title.trim() : '';
        try {
          const raw = await fs.readFile(path.join(workDir, 'video-meta.json'), 'utf8');
          const videoMeta = parseVideoMetaContent(JSON.parse(raw));
          const fromMeta =
            typeof videoMeta.metadata?.title === 'string' ? videoMeta.metadata.title.trim() : '';
          if (fromMeta) metaTitle = fromMeta;
        } catch {
          // use prepare title / default basename
        }

        const task: ReupVideoTask = {
          link: `https://www.youtube.com/watch?v=${videoId}`,
          id: prepareItem.id,
          language: destination.language,
          videoId,
          sourceId: '',
          sourceTitle: prepareItem.title.trim() || videoId,
        };

        const ctx: VideoTaskContext = {
          destination,
          videoType,
          task,
          ...(taskJobId ? { taskJobId } : {}),
          log,
          stepTimer,
          workDir,
          downloaded: {
            youtubeVideoId: videoId,
            outputDir: workDir,
            audioPath,
            transcriptPath: subtitlePath,
          },
          subtitlePath,
        };

        activeStageId = CREATE_VIDEO_STAGE_IDS.assemble;
        startCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);

        const channelAvatarPath = await resolveChannelAvatarForVideoAssembly(destination.id, {
          enabled: destination.showChannelAvatar,
          onLog: log.enabled ? msg => log.info(msg) : undefined,
        });

        const assembleCtx = buildAssembleContext(ctx, {
          outputBasename: sanitizeVideoOutputBasename(metaTitle) || OUTPUT_VIDEO_BASENAME,
          ...(channelAvatarPath ? { channelAvatarPath } : {}),
          ...(taskJobId ? { beginRenderPhase: () => taskQueueRepository.setLivePhase(taskJobId, 'ffmpeg') } : {}),
        });

        const readiness = await strategy.canAssemble(assembleCtx, fromDisk.assets);
        if (!readiness.ready) {
          throw new AppError(readiness.reason, 409, 'NOT_READY_TO_ASSEMBLE');
        }

        const reupVideoPath = await strategy.assemble(assembleCtx, fromDisk.assets);
        completeCreateVideoStage(taskJobId, CREATE_VIDEO_STAGE_IDS.assemble);

        videoPrepareRepository.markCreated(destination.id, videoId);
        log.ok(`Assembled video for ${videoId} → ${reupVideoPath}`);

        items.push({
          link: task.link,
          channelId: destination.id,
          language: destination.language,
          videoId,
          youtubeVideoId: videoId,
          outputPath: reupVideoPath,
          audioPath,
          updatedSrtPath: subtitlePath,
          reupVideoPath,
          ...(fromDisk.assets.heroImagePath ? { heroImagePath: fromDisk.assets.heroImagePath } : {}),
          ...(fromDisk.assets.aiScenePrompts ? { aiScenePrompts: fromDisk.assets.aiScenePrompts } : {}),
        });
      } catch (err) {
        if (taskJobId && activeStageId) {
          failCreateVideoStage(taskJobId, activeStageId, err);
        }
        this.logUnhandledTaskError(taskJobId, err);
        throw err;
      }
    }

    if (taskJobId) {
      taskQueueRepository.setLivePhase(taskJobId, 'done');
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
        ...(assets.heroImagePath ? { heroImagePath: assets.heroImagePath } : {}),
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
    if (details && typeof details.responsePath === 'string') {
      taskQueueRepository.appendLogMessage(taskJobId, 'err', `LLM response saved: ${details.responsePath}`);
    }
  }
}

export const reupAudioPipeline = new ReupAudioPipeline(sourceCatalogAdapter);
