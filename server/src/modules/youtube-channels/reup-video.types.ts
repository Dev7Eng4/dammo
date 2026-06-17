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
  outputPath: string;
}

export interface CreateReupVideosResult {
  items: ReupVideoOutputItem[];
}
