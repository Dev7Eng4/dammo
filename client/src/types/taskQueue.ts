export type TaskType = 'add_source' | 'create_video' | 'upload_video' | 'download_source';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskLogLevel = 'info' | 'exec' | 'ok' | 'err';

export type TaskLivePhase = 'downloading' | 'ffmpeg' | 'metadata' | 'done';

export type TaskStageStatus = 'pending' | 'doing' | 'done' | 'failed' | 'skipped';

export interface TaskErrorDetails {
  code?: string;
  step?: string | number;
  attempt?: number;
  reason?: string;
  missingFields?: string[];
  snippet?: string;
  context?: string;
}

export interface TaskStage {
  id: string;
  label: string;
  status: TaskStageStatus;
  error?: string;
  errorDetails?: TaskErrorDetails;
}

export interface TaskLogEntry {
  at: string;
  level: TaskLogLevel;
  message: string;
}

export interface AddSourceTaskPayload {
  url: string;
  purpose: string;
  language: string;
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
  videoIds?: string[];
  regenerateMetadata?: boolean;
  /** Assemble final mp4 only for existing Prepared videos */
  assembleOnly?: boolean;
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
  videoIds?: string[];
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
  errorDetails?: TaskErrorDetails;
  livePhase?: TaskLivePhase;
  stages?: TaskStage[];
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
    ...item,
    logs: detail.logs,
    result: detail.result,
    stages: item.stages ?? detail.stages,
    errorDetails: item.errorDetails ?? detail.errorDetails,
    error: item.error ?? detail.error,
    progressLabel: item.progressLabel ?? detail.progressLabel,
    livePhase: item.livePhase ?? detail.livePhase,
    status: item.status,
    updatedAt: item.updatedAt,
  };
}
