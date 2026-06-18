import { AppError } from '../../shared/http/errors.js';
import { sourceChannelsService } from '../source-channels/source-channels.service.js';
import type { SourcePurpose } from '../source-channels/source-channels.types.js';
import { reupVideoCreatorService } from '../youtube-channels/reup-video-creator.service.js';
import { taskQueueRepository } from './task-queue.repository.js';
import type { AddSourceTaskPayload, CreateVideoTaskPayload, TaskJob } from './task-queue.types.js';

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
  });
  updateProgress(job.id, 80, 'Saving videos');
  return { item };
}

async function processCreateVideo(job: TaskJob): Promise<unknown> {
  const payload = job.payload as CreateVideoTaskPayload;
  updateProgress(job.id, 15, 'Downloading video');
  const result = await reupVideoCreatorService.createVideos(payload.channelId, {
    taskJobId: job.id,
  });
  updateProgress(job.id, 75, 'Processing video');
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
