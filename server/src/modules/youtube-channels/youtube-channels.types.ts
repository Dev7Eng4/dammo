import type { ChannelLanguage } from './channel-language.js';
export type { ChannelLanguage } from './channel-language.js';
import type { CaptionStyleKey } from '../video-production/shared/render-core/caption-styles.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';

export type YoutubeChannelType = 'content' | 'reup_audio' | 'reup_video' | 'content_sale' | 'remake_video';

/**
 * Channel types configured and produced like Reup audio (VOICEVOX/TTS narration over AI scenes or a
 * still). `remake_video` is the same pipeline under its own label, for channels whose videos are
 * remade step by step on the Video production page.
 */
export function isReupAudioFamilyType(type: string | undefined): boolean {
  return type === 'reup_audio' || type === 'remake_video';
}

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
export type VideoCreationOrder =
  | 'oldest_first'
  | 'newest_first'
  | 'lowest_views_first'
  | 'shortest_duration_first';
export type MonetizationStatus = 'monetized' | 'in_review' | 'demonetized' | 'limited';
export type HealthScore = 'high' | 'medium' | 'low';
export type SourceMode = 'channels' | 'trend_brain';

/**
 * remake_video only: what "Chuẩn bị video" / "Tạo video" does before metadata, thumbnail and scenes —
 * remake the source transcript into a new script (ChatGPT/Gemini) and read it with VOICEVOX, replacing
 * the source audio. Unset fields fall back to Settings (AI tools → Remake, default VOICEVOX voice).
 * Missing object = on with defaults; `enabled: false` = old behaviour (source audio kept).
 */
export interface RemakeAutoConfig {
  enabled?: boolean;
  provider?: 'gpt' | 'gemini' | 'claude';
  promptSetId?: string;
  /** Saved VOICEVOX voice (Settings → Giọng đọc); default voice when unset. */
  voicePresetId?: string;
  /** 0.7–1.5, default 1. */
  speedScale?: number;
}

export type YoutubeChannelStatus = 'init' | 'created' | 'active' | 'paused' | 'deleted';

export type ReupAudioVideoType = 'si' | 'ai' | 'ai_full_video' | 'ai_intro_video';

/** Types that build scenes from AI images: the plain `ai` flow and the two video variants. */
export function isAiSceneVideoType(type: ReupAudioVideoType | string | undefined): boolean {
  return type === 'ai' || type === 'ai_full_video' || type === 'ai_intro_video';
}

export type ReupAudioBackgroundImage = 'no_image' | 'local_image' | 'one_image' | 'multi_image' | 'celebrity';

export type { CaptionStyleKey } from '../video-production/shared/render-core/caption-styles.js';

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
  /**
   * Where reup videos come from: `channels` (default) = the source channels above;
   * `trend_brain` = hot videos the trend brain (jp-psy-trends) found, hottest first.
   */
  sourceMode?: SourceMode;
  /** trend_brain only: K-clusters to take videos from (empty = all clusters). */
  trendClusters?: string[];
  /** remake_video only: automatic script remake + VOICEVOX narration when preparing/creating videos. */
  remakeAuto?: RemakeAutoConfig;
  /** Oldest unprocessed first vs newest first when creating/preparing videos */
  videoCreationOrder?: VideoCreationOrder;
  contentProjectId: string;
  reupVideoSourceId?: string;
  reupAudioSourceId?: string;
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  /** Required when reupAudioBackgroundImage is `celebrity` */
  celebrityId?: string;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  /** Mascot thumbnail mode: number of AI-designed candidates (2-4) drawn with the channel mascot. Unset = off. */
  mascotThumbnailCandidates?: number;
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
  /** YPP progress: 12-month watch hours (Studio only, entered manually) */
  watchHours?: number;
  /** Subscriber count (public, refreshed via yt-dlp or entered manually) */
  subscribers?: number;
  statsUpdatedAt?: string;
  /** Channel avatar URL from the last sync (remote URL, not a downloaded file). */
  avatarUrl?: string;
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
  sourceMode?: SourceMode;
  trendClusters?: string[];
  remakeAuto?: RemakeAutoConfig;
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  thumbnailBackgroundTempSessionId?: string;
  avatarTempSessionId?: string;
  mascotTempSessionId?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  celebrityId?: string;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  /** Mascot thumbnail mode: number of AI-designed candidates (2-4) drawn with the channel mascot. Unset = off. */
  mascotThumbnailCandidates?: number;
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
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  celebrityId?: string;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  /** Mascot thumbnail mode: number of AI-designed candidates (2-4) drawn with the channel mascot. Unset = off. */
  mascotThumbnailCandidates?: number;
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
