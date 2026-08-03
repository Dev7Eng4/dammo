import type { ChannelLanguage } from './channel-language.js';
export type { ChannelLanguage } from './channel-language.js';
import type { CaptionStyleKey } from '../video-production/shared/si-video/caption-styles.js';
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
export type VideoCreationOrder = 'oldest_first' | 'newest_first';
export type MonetizationStatus = 'monetized' | 'in_review' | 'demonetized' | 'limited';
export type HealthScore = 'high' | 'medium' | 'low';
export type YoutubeChannelStatus = 'active' | 'suspended';

export type ReupAudioVideoType = 'si' | 'ai';

export type ReupAudioBackgroundImage = 'no_image' | 'local_image' | 'one_image' | 'multi_image';

export type { CaptionStyleKey } from '../video-production/shared/si-video/caption-styles.js';

export type BackgroundFootageMode = 'source' | 'local';

/** Max scene duration (seconds) per density level for AI / SI multi_image prompts. */
export interface AiSceneDensityMaxSec {
  high: number;
  medium: number;
  low: number;
}

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
  /** Oldest unprocessed first vs newest first when creating/preparing videos */
  videoCreationOrder?: VideoCreationOrder;
  contentProjectId: string;
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  showSubscribe?: boolean;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  subscribeFile?: string;
  showDisclaimer?: boolean;
  disclaimerText?: string;
  descriptionDisclaimerText?: string;
  uploadFrequency?: UploadFrequency;
  notes?: string;
  lastUploadAt?: string;
  /** Computed for API responses; not persisted */
  nextUploadAt?: string | null;
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
  niche: string;
  sourceChannels?: string[];
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  thumbnailBackgroundTempSessionId?: string;
  avatarTempSessionId?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  showSubscribe?: boolean;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  subscribeFile?: string;
  showDisclaimer?: boolean;
  disclaimerText?: string;
  descriptionDisclaimerText?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}

export interface UpdateYoutubeChannelInput {
  mailAccountId: string;
  /** When the channel currently uses default linked email, may update YouTube identity. */
  channelUrl?: string;
  type: YoutubeChannelType;
  language: ChannelLanguage;
  niche: string;
  sourceChannels?: string[];
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  showSubscribe?: boolean;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  subscribeFile?: string;
  showDisclaimer?: boolean;
  disclaimerText?: string;
  descriptionDisclaimerText?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}
