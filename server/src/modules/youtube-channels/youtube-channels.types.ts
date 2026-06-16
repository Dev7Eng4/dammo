export type YoutubeChannelType = 'own_content' | 'client' | 'content_selling';
export type MonetizationStatus = 'monetized' | 'in_review' | 'demonetized' | 'limited';
export type HealthScore = 'high' | 'medium' | 'low';
export type YoutubeChannelStatus = 'active' | 'suspended';

export interface YoutubeChannelActivity {
  at: string;
  message: string;
}

export interface YoutubeChannel {
  id: string;
  name: string;
  handle: string;
  youtubeUrl: string;
  type: YoutubeChannelType;
  niche: string;
  language: string;
  monetizationStatus: MonetizationStatus;
  healthScore: HealthScore;
  status: YoutubeChannelStatus;
  linkedEmail: string;
  uploadSchedule: string;
  sourceMapping: string;
  contentProjectId: string;
  notes?: string;
  recentActivity: YoutubeChannelActivity[];
  lastUploadAt?: string;
  createdAt: string;
}

export interface YoutubeChannelsStore {
  channels: YoutubeChannel[];
}

export interface YoutubeChannelStats {
  total: number;
  monetized: number;
  inReview: number;
  limited: number;
  stale: number;
  addedThisWeek: number;
}

export interface CreateYoutubeChannelInput {
  mailAccountId: string;
  channelUrl: string;
  sourceChannelId: string;
}
