export interface OverviewStats {
  youtubeChannels: number;
  tiktokAccounts: number;
  facebookAssets: number;
  sourceChannels: number;
}

export type PipelineHighlight = 'info' | 'success' | 'danger';

export interface PipelineStep {
  id: string;
  label: string;
  count: number;
  highlight?: PipelineHighlight;
}

export interface AccountSummary {
  total: number;
  active: number;
  needVerify: number;
  limited: number;
  suspended: number;
  lostAccess: number;
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
  pipeline: PipelineStep[];
  accounts: AccountSummary;
  activeRender: ActiveRender;
  recentProjects: RecentProject[];
  healthAlerts: HealthAlert[];
}
