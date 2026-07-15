import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { generateId } from '../../shared/id.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { emitTaskQueueEvent } from './task-queue.events.js';
import { toTaskJobSummary } from './task-queue.summary.js';
import type {
  EnqueueTaskInput,
  TaskJob,
  TaskJobLogsResponse,
  TaskJobSummary,
  TaskLogEntry,
  TaskLogLevel,
  TaskLivePhase,
  TaskStatus,
} from './task-queue.types.js';

const STATE_FILE = 'queue-state.json';
const MAX_LOG_LINES = 300;
const TERMINAL_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled']);

function formatLogTime(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface QueueState {
  paused: boolean;
}

function jobFilePath(id: string): string {
  return path.join(paths.taskQueueDir, `${id}.json`);
}

function stateFilePath(): string {
  return path.join(paths.taskQueueDir, STATE_FILE);
}

function publishJob(job: TaskJob): void {
  emitTaskQueueEvent({ type: 'job_updated', job: toTaskJobSummary(job) });
}

export class TaskQueueRepository {
  isPaused(): boolean {
    return readJson<QueueState>(stateFilePath())?.paused ?? false;
  }

  setPaused(paused: boolean): void {
    writeJson(stateFilePath(), { paused });
  }

  create(input: EnqueueTaskInput): TaskJob {
    const now = new Date().toISOString();
    const job: TaskJob = {
      id: generateId(),
      type: input.type,
      status: 'queued',
      title: input.title,
      subtitle: input.subtitle,
      progress: 0,
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
    };
    writeJson(jobFilePath(job.id), job);
    publishJob(job);
    return job;
  }

  findById(id: string): TaskJob | null {
    return readJson<TaskJob>(jobFilePath(id));
  }

  update(id: string, updater: (job: TaskJob) => TaskJob): TaskJob | null {
    const current = this.findById(id);
    if (!current) return null;
    const next = updater(current);
    writeJson(jobFilePath(id), next);
    return next;
  }

  setStatus(
    id: string,
    status: TaskStatus,
    patch?: Partial<Pick<TaskJob, 'progress' | 'progressLabel' | 'error' | 'result' | 'logs' | 'livePhase'>>,
  ): TaskJob | null {
    const updated = this.update(id, job => ({
      ...job,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    }));
    if (updated) publishJob(updated);
    return updated;
  }

  appendLog(id: string, entry: TaskLogEntry): TaskJob | null {
    const updated = this.update(id, job => {
      const logs = [...(job.logs ?? []), entry].slice(-MAX_LOG_LINES);
      return { ...job, logs, updatedAt: new Date().toISOString() };
    });
    if (updated) {
      emitTaskQueueEvent({
        type: 'log_appended',
        jobId: id,
        entry,
        total: updated.logs?.length ?? 0,
      });
    }
    return updated;
  }

  appendLogMessage(id: string, level: TaskLogLevel, message: string): TaskJob | null {
    return this.appendLog(id, { at: formatLogTime(), level, message });
  }

  setLivePhase(id: string, livePhase: TaskLivePhase): TaskJob | null {
    const updated = this.update(id, job => ({
      ...job,
      livePhase,
      updatedAt: new Date().toISOString(),
    }));
    if (updated) publishJob(updated);
    return updated;
  }

  getLogs(id: string, after = 0): TaskJobLogsResponse {
    const job = this.findById(id);
    if (!job) return { logs: [], total: 0 };
    const logs = job.logs ?? [];
    const safeAfter = Math.max(0, Math.min(after, logs.length));
    return { logs: logs.slice(safeAfter), total: logs.length };
  }

  listAll(limit = 50): TaskJob[] {
    if (!fs.existsSync(paths.taskQueueDir)) return [];
    return fs
      .readdirSync(paths.taskQueueDir)
      .filter(f => f.endsWith('.json') && f !== STATE_FILE)
      .map(f => readJson<TaskJob>(path.join(paths.taskQueueDir, f)))
      .filter((job): job is TaskJob => job !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listSummaries(limit = 50): TaskJobSummary[] {
    return this.listAll(limit).map(toTaskJobSummary);
  }

  findNextQueued(): TaskJob | null {
    return (
      this.listAll(200)
        .filter(job => job.status === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
    );
  }

  clearFinished(): { removed: number; ids: string[] } {
    if (!fs.existsSync(paths.taskQueueDir)) return { removed: 0, ids: [] };

    const ids: string[] = [];

    for (const fileName of fs.readdirSync(paths.taskQueueDir)) {
      if (!fileName.endsWith('.json') || fileName === STATE_FILE) continue;

      const filePath = path.join(paths.taskQueueDir, fileName);
      const job = readJson<TaskJob>(filePath);
      if (!job || !TERMINAL_STATUSES.has(job.status)) continue;

      fs.unlinkSync(filePath);
      ids.push(job.id);
    }

    if (ids.length > 0) {
      emitTaskQueueEvent({ type: 'jobs_cleared', ids });
    }

    return { removed: ids.length, ids };
  }
}

export const taskQueueRepository = new TaskQueueRepository();
