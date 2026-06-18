export type YoutubeChannelType = 'content' | 'reup_audio' | 'reup_video' | 'content_sale';

/** @deprecated Legacy persisted value; mapped to reup_video in forms */
export type LegacyYoutubeChannelType = 'reup';

export type StoredYoutubeChannelType = YoutubeChannelType | LegacyYoutubeChannelType;

export type ReupYoutubeChannelType = 'reup_audio' | 'reup_video';

export function isReupYoutubeChannelType(
  type: YoutubeChannelType | '',
): type is ReupYoutubeChannelType {
  return type === 'reup_audio' || type === 'reup_video';
}

export function isStoredReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

export type TargetAudience = 'en' | 'ko' | 'ja' | 'es';

export const TARGET_AUDIENCE_LABELS: Record<TargetAudience, string> = {
  en: 'English',
  ko: 'Korean',
  ja: 'Japanese',
  es: 'Spanish',
};

const LEGACY_LANGUAGE_TO_TARGET: Record<string, TargetAudience> = {
  'EN-US': 'en',
  'EN-UK': 'en',
  'JA-JP': 'ja',
  'ES-ES': 'es',
};

export function parseStoredTargetAudience(value: string): TargetAudience | '' {
  if (value in TARGET_AUDIENCE_LABELS) return value as TargetAudience;
  return LEGACY_LANGUAGE_TO_TARGET[value] ?? '';
}

export function formatTargetAudienceLabel(value: string): string {
  return TARGET_AUDIENCE_LABELS[value as TargetAudience] ?? value;
}
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
  type: StoredYoutubeChannelType;
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
  channelId?: string;
}

export interface YoutubeChannelsResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: YoutubeChannel[];
}

export interface YoutubeChannelStats {
  total: number;
  monetized: number;
  inReview: number;
  limited: number;
  stale: number;
  addedThisWeek: number;
}

export type YoutubeChannelTypeFilter = 'all' | YoutubeChannelType;

export const YOUTUBE_CHANNEL_TYPE_LABELS: Record<YoutubeChannelType | 'reup', string> = {
  content: 'Content',
  reup_audio: 'Reup Audio',
  reup_video: 'Reup Video',
  content_sale: 'Content Sale',
  reup: 'Reup',
};
export type YoutubeMonetizationFilter = 'all' | MonetizationStatus;

export interface YoutubeChannelVideo {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
}

export interface YoutubeChannelVideosResponse {
  items: YoutubeChannelVideo[];
}

export interface YoutubeVideoComment {
  id: string;
  text: string;
  author: string;
  authorThumbnail?: string;
  likeCount?: number;
  timestamp?: string;
  replies?: YoutubeVideoComment[];
}

export interface YoutubeVideoCommentsResponse {
  items: YoutubeVideoComment[];
}

export interface ReupVideoOutputItem {
  link: string;
  channelId: string;
  language: string;
  videoId: string;
  outputPath: string;
}

export interface CreateReupVideosResponse {
  items: ReupVideoOutputItem[];
}

export interface CreateYoutubeChannelPayload {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType;
  targetAudience: TargetAudience;
  sourceChannelIds?: string[];
  backgroundFootageSourceId?: string;
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
}

export type UpdateYoutubeChannelPayload = Omit<CreateYoutubeChannelPayload, 'channelUrl'>;

export interface AddYoutubeChannelFormValues {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType | '';
  targetAudience: TargetAudience | '';
  sourceChannelIds: string[];
  backgroundFootageSourceId: string;
  uploadFrequency: UploadFrequency | '';
  publishTimes: string[];
}

export type EditYoutubeChannelFormValues = Omit<AddYoutubeChannelFormValues, 'channelUrl'>;
