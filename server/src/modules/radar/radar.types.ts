export type RadarTier = 'spike' | 'burst' | 'super';

export interface RadarSnapshot {
  at: string;
  views: number;
}

export interface RadarVideoRecord {
  id: string;
  sourceId: string;
  channelId: string;
  title: string;
  url: string;
  publishedAt: string;
  durationSeconds: number;
  snapshots: RadarSnapshot[];
}

/** Per-channel baseline: median lifetime views of its mature videos (age-normalised). */
export interface RadarChannelBaseline {
  sourceId: string;
  baselineViews: number;
  matureVideoCount: number;
  computedAt: string;
}

export interface RadarQuotaUsage {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  used: number;
}

export interface RadarStore {
  videos: Record<string, RadarVideoRecord>;
  baselines: Record<string, RadarChannelBaseline>;
  quota: RadarQuotaUsage;
  lastScanAt?: string;
}

export interface RadarItem {
  videoId: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string;
  ageHours: number;
  durationSeconds: number;
  viewCount: number;
  viewsPerHour: number;
  expectedViews: number;
  /** viewCount ÷ expectedViews at this age. */
  ratio: number;
  tier: RadarTier;
}

export interface RadarScanResult {
  scannedChannels: number;
  skippedChannels: number;
  failedChannels: { sourceId: string; error: string }[];
  quotaUsedThisScan: number;
  quotaUsedToday: number;
  quotaCap: number;
  stoppedForQuota: boolean;
}
