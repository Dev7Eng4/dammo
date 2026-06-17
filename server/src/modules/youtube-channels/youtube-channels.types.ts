import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';

export type YoutubeChannelType = 'content' | 'reup' | 'content_sale';
export type UploadFrequency =
  | 'every_5_days'
  | 'every_3_days'
  | 'every_2_days'
  | 'daily_1'
  | 'daily_2'
  | 'daily_3';
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
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSourceId?: string;
  uploadFrequency?: UploadFrequency;
  publishTimes?: string[];
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
  type: YoutubeChannelType;
  sourceChannelIds?: string[];
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSourceId?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}

export interface UpdateYoutubeChannelInput {
  mailAccountId: string;
  type: YoutubeChannelType;
  sourceChannelIds?: string[];
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSourceId?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}
