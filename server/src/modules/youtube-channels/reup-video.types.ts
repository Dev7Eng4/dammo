import type { MetaStep1ChunkDigest, MetaStep2StoryBlock, MetaStep3Output, MetaStep4Output } from './reup-metadata.types.js';

export interface ReupVideoHistoryRecord {
  channelId: string;
  videoUrl: string;
  videoId: string;
  outputPath: string;
  processedAt: string;
}

export interface ReupVideoHistoryStore {
  records: ReupVideoHistoryRecord[];
}

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
  metaStep4Output?: MetaStep4Output;
  heroImagePath?: string;
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
