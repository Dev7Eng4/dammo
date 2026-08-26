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
  /** Re-run metadata + thumbnail only for existing Prepared/Created videos */
  regenerateMetadata?: boolean;
  /** Assemble final mp4 only for existing Prepared videos (skip transcript/metadata/thumbnail) */
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

export interface TaskJob {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  subtitle?: string;
  progress: number;
  progressLabel?: string;
  error?: string;
  errorDetails?: TaskErrorDetails;
  payload: TaskPayload;
  result?: unknown;
  logs?: TaskLogEntry[];
  livePhase?: TaskLivePhase;
  stages?: TaskStage[];
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

/** Canonical create_video checklist stages (seed; skip unused branches at runtime). */
export const CREATE_VIDEO_STAGE_IDS = {
  download: 'download',
  cleanTranscript: 'clean_transcript',
  updateTranscript: 'update_transcript',
  metadata: 'metadata',
  thumbnail: 'thumbnail',
  assemble: 'assemble',
} as const;

export type CreateVideoStageId = (typeof CREATE_VIDEO_STAGE_IDS)[keyof typeof CREATE_VIDEO_STAGE_IDS];

export function buildCreateVideoStages(options?: {
  copyingAssets?: boolean;
  includeUpdateTranscript?: boolean;
}): TaskStage[] {
  const downloadLabel = options?.copyingAssets ? 'Sao chép tài nguyên' : 'Đang tải';
  const stages: TaskStage[] = [
    { id: CREATE_VIDEO_STAGE_IDS.download, label: downloadLabel, status: 'pending' },
    { id: CREATE_VIDEO_STAGE_IDS.cleanTranscript, label: 'Làm sạch transcript', status: 'pending' },
  ];

  if (options?.includeUpdateTranscript !== false) {
    stages.push({
      id: CREATE_VIDEO_STAGE_IDS.updateTranscript,
      label: 'Cập nhật transcript',
      status: 'pending',
    });
  }

  stages.push(
    { id: CREATE_VIDEO_STAGE_IDS.metadata, label: 'Tạo metadata', status: 'pending' },
    { id: CREATE_VIDEO_STAGE_IDS.thumbnail, label: 'Tạo thumbnail', status: 'pending' },
    { id: CREATE_VIDEO_STAGE_IDS.assemble, label: 'Ghép video', status: 'pending' },
  );

  return stages;
}
