export interface OverviewStats {
  youtubeChannels: number;
  tiktokAccounts: number;
  facebookAssets: number;
  sourceChannels: number;
}

/** Optional per-metric history (oldest → newest); enables delta + sparkline on KPI cards. */
export type OverviewTrends = Partial<Record<keyof OverviewStats, number[]>>;

export type PipelineHighlight = 'info' | 'success' | 'danger';

export interface PipelineStep {
  id: string;
  label: string;
  count: number;
  highlight?: PipelineHighlight;
}

export interface AccountSummary {
  total: number;
}

export interface ActiveRender {
  fileName: string;
  progress: number;
  eta: string;
  filePath: string;
}

export type ProjectStatus = 'success' | 'failed' | 'rendering';

export interface RecentProject {
  id: string;
  name: string;
  format: string;
  target: string;
  status: ProjectStatus;
}

export interface UpcomingUpload {
  channelId: string;
  name: string;
  handle: string;
  /** ISO timestamp of the next scheduled publish slot */
  at: string;
}

export interface SystemHealth {
  ram: { freeBytes: number; totalBytes: number };
  disk: { freeBytes: number; totalBytes: number } | null;
  queue: { queued: number; running: number; failed: number; paused: boolean };
}

export interface ProductionStats {
  today: { completed: number; failed: number; videos: number };
  last7Days: { completed: number; failed: number; videos: number };
  avgMinutesPerVideo: number | null;
  sampleSize: number;
}

export interface TrendingSourceVideo {
  videoId: string;
  title: string;
  url: string;
  viewCount: number;
  /** viewCount ÷ median viewCount of the same source channel */
  ratio: number;
  sourceId: string;
  sourceName: string;
  used: boolean;
}

export type AlertSeverity = 'warning' | 'neutral' | 'danger';

export interface HealthAlert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
}

export type SearchResultType =
  | 'mail_account'
  | 'youtube_channel'
  | 'source_channel'
  | 'project'
  | 'account'
  | 'render';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  label: string;
  path: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface DashboardData {
  overview: OverviewStats;
  overviewTrends?: OverviewTrends;
  pipeline: PipelineStep[];
  accounts: AccountSummary;
  activeRender: ActiveRender;
  recentProjects: RecentProject[];
  healthAlerts: HealthAlert[];
  upcomingUploads: UpcomingUpload[];
  systemHealth?: SystemHealth;
  productionStats?: ProductionStats;
  trendingSources?: TrendingSourceVideo[];
}
