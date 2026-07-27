export type TaskType = 'add_source' | 'create_video' | 'upload_video' | 'download_source';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskLogLevel = 'info' | 'exec' | 'ok' | 'err';

export type TaskLivePhase = 'downloading' | 'ffmpeg' | 'metadata' | 'done';

export interface TaskLogEntry {
  at: string;
  level: TaskLogLevel;
  message: string;
}

export interface AddSourceTaskPayload {
  url: string;
  purpose: string;
  niche?: string;
}

export interface CreateVideoTaskPayload {
  channelId?: string;
  channelIds?: string[];
  allReupChannels?: boolean;
  channelName?: string;
  channelHandle?: string;
  videoCount?: number;
  prepareOnly?: boolean;
}

export interface UploadVideoTaskPayload {
  channelId?: string;
  channelIds?: string[];
  allReupChannels?: boolean;
  maxUploads?: number;
  videoIds?: string[];
}

export interface DownloadSourceTaskPayload {
  sourceId?: string;
  sourceIds?: string[];
  allSources?: boolean;
  sourceName?: string;
}

export type TaskPayload = AddSourceTaskPayload | CreateVideoTaskPayload | UploadVideoTaskPayload | DownloadSourceTaskPayload;

export interface TaskJobListItem {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  subtitle?: string;
  progress: number;
  progressLabel?: string;
  error?: string;
  livePhase?: TaskLivePhase;
  logCount?: number;
  payload: TaskPayload;
  outputPath?: string;
  sourceId?: string;
  videoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskJob extends TaskJobListItem {
  result?: unknown;
  logs?: TaskLogEntry[];
}

export interface TaskJobLogsResponse {
  logs: TaskLogEntry[];
  total: number;
}

export interface TaskQueueListResponse {
  items: TaskJobListItem[];
  paused: boolean;
}

export interface EnqueueAddSourceInput {
  type: 'add_source';
  title?: string;
  subtitle?: string;
  payload: AddSourceTaskPayload;
}

export interface EnqueueCreateVideoInput {
  type: 'create_video';
  title?: string;
  subtitle?: string;
  payload: CreateVideoTaskPayload;
}

export interface EnqueueUploadVideoInput {
  type: 'upload_video';
  title?: string;
  subtitle?: string;
  payload: UploadVideoTaskPayload;
}

export interface EnqueueDownloadSourceInput {
  type: 'download_source';
  title?: string;
  subtitle?: string;
  payload: DownloadSourceTaskPayload;
}

export type EnqueueTaskInput = EnqueueAddSourceInput | EnqueueCreateVideoInput | EnqueueUploadVideoInput | EnqueueDownloadSourceInput;

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function mergeTaskJob(item: TaskJobListItem, detail?: TaskJob | null): TaskJob {
  if (!detail) return item;
  return {
    ...item,
    ...detail,
    logs: detail.logs,
    result: detail.result,
  };
}
