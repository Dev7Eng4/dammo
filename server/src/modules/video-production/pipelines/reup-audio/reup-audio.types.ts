import type { MetaStep1ChunkDigest, MetaStep2StoryBlock, MetaStep3Output } from '../../shared/meta/metadata.types.js';
import type { ThumbnailHorizontalOutput } from '../../shared/thumbnail/thumbnail.types.js';

export interface ReupVideoTask {
  link: string;
  id: string;
  language: string;
  videoId: string;
  sourceId: string;
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
  metaStep1ChunkDigests?: MetaStep1ChunkDigest[];
  metaStep2StoryBlocks?: MetaStep2StoryBlock[];
  metaStep3Output?: MetaStep3Output;
  thumbnailHorizontalOutput?: ThumbnailHorizontalOutput;
  heroImagePath?: string;
  thumbnailVisualPath?: string;
  reupThumbnailPath?: string;
  reupVideoPath?: string;
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
