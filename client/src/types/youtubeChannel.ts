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

export const YOUTUBE_CHANNEL_TYPE_LABELS: Record<YoutubeChannelType, string> = {
  content: 'Content',
  reup: 'Reup',
  content_sale: 'Content Sale',
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

export interface CreateYoutubeChannelPayload {
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

export type UpdateYoutubeChannelPayload = Omit<CreateYoutubeChannelPayload, 'channelUrl'>;

export interface AddYoutubeChannelFormValues {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType | '';
  sourceChannelIds: string[];
  reupVideoSourceId: string;
  reupAudioSourceId: string;
  backgroundFootageSourceId: string;
  uploadFrequency: UploadFrequency | '';
  publishTimes: string[];
}

export type EditYoutubeChannelFormValues = Omit<AddYoutubeChannelFormValues, 'channelUrl'>;
