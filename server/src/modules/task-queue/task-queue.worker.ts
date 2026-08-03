import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { sourceChannelsService } from '../source-channels/source-channels.service.js';
import type { SourcePurpose } from '../source-channels/source-channels.types.js';
import { sourceDownloadService } from '../source-channels/source-download.service.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { videoProductionService } from '../video-production/video-production.service.js';
import { youtubeUploadService } from '../youtube-upload/youtube-upload.service.js';
import { taskQueueRepository } from './task-queue.repository.js';
import type { AddSourceTaskPayload, CreateVideoTaskPayload, DownloadSourceTaskPayload, TaskJob, UploadVideoTaskPayload } from './task-queue.types.js';

let activeCount = 0;
let filling = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

function updateProgress(
  id: string,
  progress: number,
  progressLabel: string,
): void {
  taskQueueRepository.setStatus(id, 'running', { progress, progressLabel });
}

async function processAddSource(job: TaskJob): Promise<unknown> {
  const payload = job.payload as AddSourceTaskPayload;
  updateProgress(job.id, 10, 'Fetching metadata');
  const item = await sourceChannelsService.create({
    url: payload.url,
    purpose: payload.purpose as SourcePurpose,
    ...(payload.niche ? { niche: payload.niche } : {}),
  });
  updateProgress(job.id, 80, 'Saving videos');
  return { item };
}

async function processCreateVideo(job: TaskJob): Promise<unknown> {
  const payload = job.payload as CreateVideoTaskPayload;
  const options = {
    taskJobId: job.id,
    ...(payload.videoCount != null ? { maxVideosPerChannel: payload.videoCount } : {}),
  };
  const prepareOnly = payload.prepareOnly === true;

  if (payload.allReupChannels) {
    updateProgress(job.id, 15, prepareOnly ? 'Preparing all reup channels' : 'Processing all reup channels');
    const result = prepareOnly
      ? await videoProductionService.prepareVideosForAllReupChannels(options)
      : await videoProductionService.createVideosForAllReupChannels(options);
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  if (payload.channelIds?.length) {
    updateProgress(
      job.id,
      15,
      prepareOnly
        ? `Preparing ${payload.channelIds.length} channel(s)`
        : `Processing ${payload.channelIds.length} channel(s)`,
    );
    const result = prepareOnly
      ? await videoProductionService.prepareVideosForChannels(payload.channelIds, options)
      : await videoProductionService.createVideosForChannels(payload.channelIds, options);
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  updateProgress(job.id, 15, prepareOnly ? 'Preparing assets' : 'Downloading assets');
  const result = prepareOnly
    ? await videoProductionService.prepareVideosForYoutubeChannel(payload.channelId!, options)
    : await videoProductionService.createVideosForYoutubeChannel(payload.channelId!, options);
  updateProgress(job.id, 90, 'Finishing');
  return result;
}

async function processUploadVideo(job: TaskJob): Promise<unknown> {
  const payload = job.payload as UploadVideoTaskPayload;

  if (payload.allReupChannels) {
    updateProgress(job.id, 15, 'Uploading all reup channels');
    const channelIds = youtubeChannelsRepository
      .findAll()
      .filter(ch => ch.type === 'reup_audio' || ch.type === 'reup_video')
      .map(ch => ch.id);
    const result = await youtubeUploadService.uploadChannels(channelIds, {
      maxUploads: payload.maxUploads,
      videoIds: payload.videoIds,
    });
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  if (payload.channelIds?.length) {
    updateProgress(job.id, 15, `Uploading ${payload.channelIds.length} channel(s)`);
    const result = await youtubeUploadService.uploadChannels(payload.channelIds, {
      maxUploads: payload.maxUploads,
      videoIds: payload.videoIds,
    });
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  updateProgress(job.id, 15, 'Uploading via GPM');
  const result = await youtubeUploadService.uploadChannel(payload.channelId!, {
    maxUploads: payload.maxUploads,
    videoIds: payload.videoIds,
  });
  updateProgress(job.id, 90, 'Finishing');
  return result;
}

async function processDownloadSource(job: TaskJob): Promise<unknown> {
  const payload = job.payload as DownloadSourceTaskPayload;

  if (payload.allSources) {
    updateProgress(job.id, 15, 'Downloading all YouTube sources');
    const result = await sourceDownloadService.downloadVideosForAllYoutubeSources({ taskJobId: job.id });
    updateProgress(job.id, 90, 'Finishing');
    return { sources: result };
  }

  if (payload.sourceIds?.length) {
    updateProgress(job.id, 15, `Downloading ${payload.sourceIds.length} source(s)`);
    const result = await sourceDownloadService.downloadVideosForSources(payload.sourceIds, { taskJobId: job.id });
    updateProgress(job.id, 90, 'Finishing');
    return { sources: result };
  }

  updateProgress(job.id, 15, 'Downloading source videos');
  const result = await sourceDownloadService.downloadVideosForSource(payload.sourceId!, { taskJobId: job.id });
  updateProgress(job.id, 90, 'Finishing');
  return result;
}

async function processJob(job: TaskJob): Promise<void> {
  taskQueueRepository.setStatus(job.id, 'running', {
    progress: 5,
    progressLabel: 'Starting',
  });

  try {
    const result =
      job.type === 'add_source'
        ? await processAddSource(job)
        : job.type === 'download_source'
          ? await processDownloadSource(job)
          : job.type === 'upload_video'
            ? await processUploadVideo(job)
            : await processCreateVideo(job);

    taskQueueRepository.setStatus(job.id, 'completed', {
      progress: 100,
      progressLabel: 'Done',
      result,
    });
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Task failed';
    taskQueueRepository.setStatus(job.id, 'failed', { error: message });
  }
}

function fillSlots(): void {
  if (filling || taskQueueRepository.isPaused()) return;

  filling = true;
  try {
    while (activeCount < env.taskQueueConcurrency) {
      const job = taskQueueRepository.findNextQueued();
      if (!job) break;

      activeCount += 1;
      // processJob sets status to running synchronously before first await,
      // so the next findNextQueued in this loop will not reclaim the same job.
      processJob(job).finally(() => {
        activeCount = Math.max(0, activeCount - 1);
      });
    }
  } finally {
    filling = false;
  }
}

export function startTaskQueueWorker(pollMs = 2000): void {
  if (workerInterval) return;

  workerInterval = setInterval(() => {
    try {
      fillSlots();
    } catch {
      filling = false;
    }
  }, pollMs);

  try {
    fillSlots();
  } catch {
    filling = false;
  }
}

export function stopTaskQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
