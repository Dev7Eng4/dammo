import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  EnqueueTaskInput,
  TaskJob,
  TaskJobLogsResponse,
  TaskQueueListResponse,
} from '../types/taskQueue';

export function fetchTaskQueue(options?: FetchOptions & { view?: 'summary' | 'full' }) {
  const view = options?.view ?? 'summary';
  const query = view === 'summary' ? '?view=summary' : '';
  return fetchJson<TaskQueueListResponse>(
    `${API_V1}/task-queue${query}`,
    withSignal(undefined, options),
  );
}

export function fetchTaskJob(id: string, options?: FetchOptions) {
  return fetchJson<{ item: TaskJob }>(`${API_V1}/task-queue/${id}`, withSignal(undefined, options));
}

export function fetchTaskJobLogs(id: string, after: number, options?: FetchOptions) {
  return fetchJson<TaskJobLogsResponse>(
    `${API_V1}/task-queue/${id}/logs?after=${after}`,
    withSignal(undefined, options),
  );
}

export function enqueueTask(input: EnqueueTaskInput) {
  return fetchJson<{ item: TaskJob }>(`${API_V1}/task-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function cancelTask(id: string) {
  return fetchJson<{ item: TaskJob }>(`${API_V1}/task-queue/${id}/cancel`, { method: 'POST' });
}

export function pauseTaskQueue() {
  return fetchJson<{ paused: boolean }>(`${API_V1}/task-queue/pause`, { method: 'POST' });
}

export function resumeTaskQueue() {
  return fetchJson<{ paused: boolean }>(`${API_V1}/task-queue/resume`, { method: 'POST' });
}

export function clearFinishedTasks() {
  return fetchJson<{ removed: number; ids: string[] }>(`${API_V1}/task-queue/clear`, { method: 'POST' });
}

export const TASK_QUEUE_STREAM_URL = `${API_V1}/task-queue/stream`;
