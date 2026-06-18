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

export type YoutubeChannelLanguage = 'en' | 'ko' | 'ja' | 'es';

/** @deprecated Use YoutubeChannelLanguage */
export type TargetAudience = YoutubeChannelLanguage;

export const YOUTUBE_CHANNEL_LANGUAGE_LABELS: Record<YoutubeChannelLanguage, string> = {
  en: 'English',
  ko: 'Korean',
  ja: 'Japanese',
  es: 'Spanish',
};

/** @deprecated Use YOUTUBE_CHANNEL_LANGUAGE_LABELS */
export const TARGET_AUDIENCE_LABELS = YOUTUBE_CHANNEL_LANGUAGE_LABELS;

const LEGACY_LANGUAGE_MAP: Record<string, YoutubeChannelLanguage> = {
  'EN-US': 'en',
  'EN-UK': 'en',
  'JA-JP': 'ja',
  'KO-KR': 'ko',
  'ES-ES': 'es',
};

export function parseStoredChannelLanguage(value: string): YoutubeChannelLanguage | '' {
  if (value in YOUTUBE_CHANNEL_LANGUAGE_LABELS) return value as YoutubeChannelLanguage;
  return LEGACY_LANGUAGE_MAP[value] ?? '';
}

/** @deprecated Use parseStoredChannelLanguage */
export function parseStoredTargetAudience(value: string): YoutubeChannelLanguage | '' {
  return parseStoredChannelLanguage(value);
}

export function formatChannelLanguageLabel(value: string): string {
  return YOUTUBE_CHANNEL_LANGUAGE_LABELS[value as YoutubeChannelLanguage] ?? value;
}

/** @deprecated Use formatChannelLanguageLabel */
export function formatTargetAudienceLabel(value: string): string {
  return formatChannelLanguageLabel(value);
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
  language: YoutubeChannelLanguage;
  monetizationStatus: MonetizationStatus;
  healthScore: HealthScore;
  status: YoutubeChannelStatus;
  linkedEmail: string;
  uploadSchedule: string[];
  sourceMapping: string;
  contentProjectId: string;
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSourceId?: string;
  uploadFrequency?: UploadFrequency;
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
  youtubeVideoId: string;
  outputPath: string;
  audioPath?: string;
  transcriptPath?: string;
  videoPath?: string;
}

export interface CreateReupVideosResponse {
  items: ReupVideoOutputItem[];
}

export interface CreateYoutubeChannelPayload {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType;
  language: YoutubeChannelLanguage;
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
  language: YoutubeChannelLanguage | '';
  sourceChannelIds: string[];
  backgroundFootageSourceId: string;
  uploadFrequency: UploadFrequency | '';
  publishTimes: string[];
}

export type EditYoutubeChannelFormValues = Omit<AddYoutubeChannelFormValues, 'channelUrl'>;
