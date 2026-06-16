import { fileJobQueue } from '../../infrastructure/queue/file-job-queue.js';
import { runFfmpegJob } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import type { FfmpegPresetKey } from '../../infrastructure/ffmpeg/ffmpeg-presets.js';

let workerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

async function processNextJob(): Promise<void> {
  if (workerRunning) return;

  const job = fileJobQueue.findPending();
  if (!job) return;

  workerRunning = true;
  fileJobQueue.setStatus(job.id, 'processing', { progress: 0, eta: '--:--:--' });

  try {
    await runFfmpegJob(
      job.inputPath,
      job.outputPath,
      job.preset as FfmpegPresetKey,
      ({ progress, eta }) => {
        fileJobQueue.setStatus(job.id, 'processing', { progress, eta });
      },
    );
    fileJobQueue.setStatus(job.id, 'completed', { progress: 100, eta: '00:00:00' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed';
    fileJobQueue.setStatus(job.id, 'failed', { error: message });
  } finally {
    workerRunning = false;
  }
}

export function startRenderQueueWorker(pollMs = 3000): void {
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

export function stopRenderQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
