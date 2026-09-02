import type { VideoMetaOutput } from '../../shared/meta/metadata.types.js';
import type { AiVideoScenePrompt } from '../../shared/ai-video/ai-video.types.js';
import type { SourceVideoStatus } from '../../../source-channels/source-channels.types.js';

export interface ReupVideoTask {
  link: string;
  id: string;
  language: string;
  videoId: string;
  sourceId: string;
  sourceTitle: string;
  sourceStatus?: SourceVideoStatus;
}

export interface ReupVideoOutputItem {
  link: string;
  channelId: string;
  language: string;
  videoId: string;
  youtubeVideoId: string;
  outputPath: string;
  thumbnailPath?: string;
  audioPath?: string;
  transcriptPath?: string;
  srtPath?: string;
  updatedSrtPath?: string;
  videoMetaOutput?: VideoMetaOutput;
  heroImagePath?: string;
  reupThumbnailPath?: string;
  reupVideoPath?: string;
  aiScenePrompts?: AiVideoScenePrompt[];
  aiScenePromptsPath?: string;
  aiSlidesDir?: string;
  videoPath?: string;
}

export interface CreateReupVideosResult {
  items: ReupVideoOutputItem[];
}

export type ReupVideoBatchChannelStatus = 'created' | 'skipped' | 'failed';

export interface ReupVideoBatchChannelResult {
  channelId: string;
  channelName: string;
  status: ReupVideoBatchChannelStatus;
  items?: ReupVideoOutputItem[];
  reason?: string;
}

export interface CreateReupVideosBatchResult {
  channels: ReupVideoBatchChannelResult[];
  items: ReupVideoOutputItem[];
}
