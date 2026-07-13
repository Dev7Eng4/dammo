import type { ChannelLanguage } from './channel-language.js';
export type { ChannelLanguage } from './channel-language.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';

export type YoutubeChannelType = 'content' | 'reup_audio' | 'reup_video' | 'content_sale';

/** @deprecated Legacy persisted value */
export type LegacyYoutubeChannelType = 'reup';

export type StoredYoutubeChannelType = YoutubeChannelType | LegacyYoutubeChannelType;

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

export type ReupAudioVideoType = 'si' | 'ai';

export type BackgroundFootageMode = 'source' | 'local';

export interface YoutubeChannel {
  id: string;
  name: string;
  handle: string;
  youtubeUrl: string;
  type: StoredYoutubeChannelType;
  niche: string;
  language: ChannelLanguage;
  monetizationStatus: MonetizationStatus;
  healthScore: HealthScore;
  status: YoutubeChannelStatus;
  linkedEmail: string;
  uploadSchedule: string[];
  sourceChannels: string[];
  contentProjectId: string;
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  uploadFrequency?: UploadFrequency;
  notes?: string;
  lastUploadAt?: string;
  createdAt: string;
  channelId?: string;
  /** Resolved server-side for API responses */
  sourceNames?: string[];
  sourceChannelNames?: string[];
  backgroundFootageNames?: string[];
}

/** Resolved from source channel IDs; included in list API responses. */
export type YoutubeChannelListItem = YoutubeChannel & {
  sourceNames: string[];
};

export interface YoutubeChannelsStore {
  channels: YoutubeChannel[];
}

export interface YoutubeChannelVideosStore {
  channelId: string;
  fetchedAt: string;
  videos: YoutubeChannelVideo[];
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
  channelUrl?: string;
  type: YoutubeChannelType;
  language: ChannelLanguage;
  sourceChannels?: string[];
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}

export interface UpdateYoutubeChannelInput {
  mailAccountId: string;
  type: YoutubeChannelType;
  language: ChannelLanguage;
  sourceChannels?: string[];
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}
