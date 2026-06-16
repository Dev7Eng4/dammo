import fs from 'node:fs';
import path from 'node:path';
import { generateId } from '../../shared/id.js';
import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { RenderJob, RenderJobStatus } from '../../modules/render-queue/render-queue.types.js';

function jobFilePath(id: string): string {
  return path.join(paths.renderJobsDir, `${id}.json`);
}

export class FileJobQueue {
  enqueue(job: RenderJob): RenderJob {
    writeJson(jobFilePath(job.id), job);
    return job;
  }

  findById(id: string): RenderJob | null {
    const filePath = jobFilePath(id);
    return readJson<RenderJob>(filePath);
  }

  update(id: string, updater: (job: RenderJob) => RenderJob): RenderJob | null {
    const current = this.findById(id);
    if (!current) return null;
    const next = updater(current);
    writeJson(jobFilePath(id), next);
    return next;
  }

  listAll(): RenderJob[] {
    if (!fs.existsSync(paths.renderJobsDir)) return [];
    return fs
      .readdirSync(paths.renderJobsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<RenderJob>(path.join(paths.renderJobsDir, f)))
      .filter((job): job is RenderJob => job !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findPending(): RenderJob | null {
    return this.listAll().find((j) => j.status === 'pending') ?? null;
  }

  findActive(): RenderJob | null {
    return this.listAll().find((j) => j.status === 'processing') ?? null;
  }

  createJob(input: { fileName: string; inputPath: string; preset: string; outputPath: string }): RenderJob {
    const now = new Date().toISOString();
    const job: RenderJob = {
      id: generateId(),
      fileName: input.fileName,
      inputPath: input.inputPath,
      outputPath: input.outputPath,
      status: 'pending',
      progress: 0,
      eta: '--:--:--',
      preset: input.preset,
      createdAt: now,
      updatedAt: now,
    };
    return this.enqueue(job);
  }

  setStatus(id: string, status: RenderJobStatus, patch?: Partial<RenderJob>): RenderJob | null {
    return this.update(id, (job) => ({
      ...job,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    }));
  }
}

export const fileJobQueue = new FileJobQueue();
