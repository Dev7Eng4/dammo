export type TaskType = 'add_source' | 'create_video' | 'upload_video';

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
}

export interface CreateVideoTaskPayload {
  channelId?: string;
  channelIds?: string[];
  allReupChannels?: boolean;
  channelName?: string;
  channelHandle?: string;
}

export interface UploadVideoTaskPayload {
  channelId?: string;
  channelIds?: string[];
  allReupChannels?: boolean;
  maxUploads?: number;
  videoIds?: string[];
}

export type TaskPayload = AddSourceTaskPayload | CreateVideoTaskPayload | UploadVideoTaskPayload;

export interface TaskJob {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  subtitle?: string;
  progress: number;
  progressLabel?: string;
  error?: string;
  payload: TaskPayload;
  result?: unknown;
  logs?: TaskLogEntry[];
  livePhase?: TaskLivePhase;
  createdAt: string;
  updatedAt: string;
}

export interface TaskJobSummary {
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

export interface TaskJobLogsResponse {
  logs: TaskLogEntry[];
  total: number;
}

export interface TaskQueueListResponse {
  items: TaskJob[] | TaskJobSummary[];
  paused: boolean;
}

export interface EnqueueTaskInput {
  type: TaskType;
  title: string;
  subtitle?: string;
  payload: TaskPayload;
}
