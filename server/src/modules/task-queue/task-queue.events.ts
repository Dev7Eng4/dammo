import type { TaskJobSummary, TaskLogEntry } from './task-queue.types.js';

export type TaskQueueEvent =
  | { type: 'snapshot'; items: TaskJobSummary[]; paused: boolean }
  | { type: 'job_updated'; job: TaskJobSummary }
  | { type: 'log_appended'; jobId: string; entry: TaskLogEntry; total: number }
  | { type: 'jobs_cleared'; ids: string[] };

const listeners = new Set<(event: TaskQueueEvent) => void>();

export function emitTaskQueueEvent(event: TaskQueueEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onTaskQueueEvent(listener: (event: TaskQueueEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
