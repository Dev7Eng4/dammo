import { AppError } from '../../shared/http/errors.js';
import { sourceChannelsService } from '../source-channels/source-channels.service.js';
import type { SourcePurpose } from '../source-channels/source-channels.types.js';
import { sourceDownloadService } from '../source-channels/source-download.service.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { videoProductionService } from '../video-production/video-production.service.js';
import { youtubeUploadService } from '../youtube-upload/youtube-upload.service.js';
import { taskQueueRepository } from './task-queue.repository.js';
import type { AddSourceTaskPayload, CreateVideoTaskPayload, DownloadSourceTaskPayload, TaskJob, UploadVideoTaskPayload } from './task-queue.types.js';

let workerRunning = false;
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

  if (payload.allReupChannels) {
    updateProgress(job.id, 15, 'Processing all reup channels');
    const result = await videoProductionService.createVideosForAllReupChannels({
      taskJobId: job.id,
    });
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  if (payload.channelIds?.length) {
    updateProgress(job.id, 15, `Processing ${payload.channelIds.length} channel(s)`);
    const result = await videoProductionService.createVideosForChannels(payload.channelIds, {
      taskJobId: job.id,
    });
    updateProgress(job.id, 90, 'Finishing');
    return result;
  }

  updateProgress(job.id, 15, 'Downloading assets');
  const result = await videoProductionService.createVideosForYoutubeChannel(payload.channelId!, {
    taskJobId: job.id,
  });
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

async function processNextJob(): Promise<void> {
  if (workerRunning || taskQueueRepository.isPaused()) return;

  const job = taskQueueRepository.findNextQueued();
  if (!job) return;

  workerRunning = true;
  try {
    await processJob(job);
  } finally {
    workerRunning = false;
  }
}

export function startTaskQueueWorker(pollMs = 2000): void {
  if (workerInterval) return;

  workerInterval = setInterval(() => {
    processNextJob().catch(() => {
      workerRunning = false;
    });
  }, pollMs);

  processNextJob().catch(() => {
    workerRunning = false;
  });
}

export function stopTaskQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
