import path from 'node:path';
import { paths } from '../../config/paths.js';
import { fileJobQueue } from '../../infrastructure/queue/file-job-queue.js';
import { resolveOutputPath, runFfmpegJob } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import type { FfmpegPresetKey } from '../../infrastructure/ffmpeg/ffmpeg-presets.js';
import type { CreateRenderJobInput, RenderJob } from './render-queue.types.js';
import { AppError } from '../../shared/http/errors.js';

export class RenderQueueService {
  list(): RenderJob[] {
    return fileJobQueue.listAll();
  }

  getActive(): RenderJob | null {
    return fileJobQueue.findActive() ?? fileJobQueue.findPending();
  }

  getById(id: string): RenderJob {
    const job = fileJobQueue.findById(id);
    if (!job) throw new AppError('Render job not found', 404, 'NOT_FOUND');
    return job;
  }

  enqueue(input: CreateRenderJobInput): RenderJob {
    const preset = (input.preset ?? 'default') as FfmpegPresetKey;
    const outputPath = resolveOutputPath(input.fileName, paths.renderOutputDir);
    return fileJobQueue.createJob({
      fileName: input.fileName,
      inputPath: input.inputPath,
      preset,
      outputPath,
    });
  }
}

export const renderQueueService = new RenderQueueService();
