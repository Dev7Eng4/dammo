export type YoutubeChannelType = 'content' | 'reup_audio' | 'reup_video' | 'content_sale';

/** @deprecated Legacy persisted value; mapped to reup_video in forms */
export type LegacyYoutubeChannelType = 'reup';

export type StoredYoutubeChannelType = YoutubeChannelType | LegacyYoutubeChannelType;

export type ReupYoutubeChannelType = 'reup_audio' | 'reup_video';

export type ReupAudioVideoType = 'si' | 'ai';

export type ReupAudioBackgroundImage = 'no_image' | 'local_image' | 'one_image' | 'multi_image' | 'celebrity';

export type CaptionStyleKey =
  | 'default'
  | 'noto_sans_red_white'
  | 'noto_sans_red_white_box'
  | 'noto_sans_blue_white'
  | 'noto_sans_blue_white_box'
  | 'noto_sans_yellow'
  | 'noto_sans_yellow_box'
  | 'noto_sans_cyan_white'
  | 'noto_sans_cyan_white_box'
  | 'noto_sans_white_purple'
  | 'noto_sans_white_purple_box'
  | 'bizudp_gothic'
  | 'bizudp_gothic_red_white'
  | 'bizudp_gothic_red_white_box'
  | 'zen_kaku'
  | 'zen_kaku_blue_white'
  | 'zen_kaku_blue_white_box'
  | 'noto_serif'
  | 'serif_white_purple'
  | 'serif_white_purple_box'
  | 'serif_yellow'
  | 'serif_yellow_box'
  | 'serif_cyan_white'
  | 'serif_cyan_white_box'
  | 'serif_red_white'
  | 'serif_red_white_box';

/** Max scene duration (seconds) per density level for AI / SI multi_image prompts. */
export interface AiSceneDensityMaxSec {
  high: number;
  medium: number;
  low: number;
}

export const DEFAULT_AI_SCENE_DENSITY_MAX_SEC: AiSceneDensityMaxSec = {
  high: 8,
  medium: 30,
  low: 60,
};

/** SI overlay picker: random asset at video assemble time. */
export const SI_OVERLAY_AUTO_SENTINEL = '__auto__';

/** SI small-video picker: random clip from a group at assemble time. */
export const SI_SMALL_VIDEO_GROUP_PREFIX = 'group:';

export function parseSmallVideoGroupId(value: string): string | null {
  if (!value.startsWith(SI_SMALL_VIDEO_GROUP_PREFIX)) return null;
  const id = value.slice(SI_SMALL_VIDEO_GROUP_PREFIX.length).trim();
  return id || null;
}

export function encodeSmallVideoGroupSelection(groupId: string): string {
  return `${SI_SMALL_VIDEO_GROUP_PREFIX}${groupId}`;
}

export function isReupYoutubeChannelType(type: YoutubeChannelType | ''): type is ReupYoutubeChannelType {
  return type === 'reup_audio' || type === 'reup_video';
}

export function isReupAudioChannelType(type: YoutubeChannelType | ''): type is 'reup_audio' {
  return type === 'reup_audio';
}

export function isStoredReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

export type YoutubeChannelLanguage = 'en' | 'ko' | 'ja' | 'es';

/** @deprecated Use YoutubeChannelLanguage */
export type TargetAudience = YoutubeChannelLanguage;

export const YOUTUBE_CHANNEL_LANGUAGE_LABELS: Record<YoutubeChannelLanguage, string> = {
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn',
  ja: 'Tiếng Nhật',
  es: 'Tiếng Tây Ban Nha',
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
export type UploadFrequency = 'every_5_days' | 'every_3_days' | 'every_2_days' | 'daily_1' | 'daily_2' | 'daily_3';
export type VideoCreationOrder = 'oldest_first' | 'newest_first';
export type MonetizationStatus = 'monetized' | 'in_review' | 'demonetized' | 'limited';
export type HealthScore = 'high' | 'medium' | 'low';
export type YoutubeChannelStatus = 'active' | 'suspended';

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
  sourceChannels: string[];
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
  /** Computed server-side for detail responses */
  nextUploadAt?: string | null;
  createdAt: string;
  channelId?: string;
  /** Resolved server-side for list responses */
  sourceNames?: string[];
  sourceChannelNames?: string[];
  backgroundFootageNames?: string[];
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
  content: 'Nội dung',
  reup_audio: 'Đăng lại âm thanh',
  reup_video: 'Đăng lại video',
  content_sale: 'Bán nội dung',
  reup: 'Đăng lại',
};
export type YoutubeMonetizationFilter = 'all' | MonetizationStatus;

export type YoutubeChannelVideoStatus = 'Published' | 'Prepared' | 'Created' | 'Uploaded' | 'Error' | 'Pending';

export type YoutubeChannelVideoStatusFilter = 'all' | YoutubeChannelVideoStatus | 'Draft';

export const YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS: {
  value: YoutubeChannelVideoStatusFilter;
  label: string;
}[] = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'Pending', label: 'Chưa xử lý' },
    { value: 'Published', label: 'Đã xuất bản' },
    { value: 'Prepared', label: 'Đã chuẩn bị' },
    { value: 'Created', label: 'Đã tạo' },
    { value: 'Draft', label: 'Bản nháp' },
  ];

export interface YoutubeChannelVideo {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
  status?: YoutubeChannelVideoStatus;
}

export interface YoutubeChannelVideosResponse {
  items: YoutubeChannelVideo[];
  fetchedAt?: string;
}

export interface YoutubeVideoContent {
  title: string;
  description: string;
  tags: string[];
  hasThumbnail: boolean;
  hasOldThumbnail: boolean;
  hasVideo: boolean;
  thumbnailUrl: string | null;
  oldThumbnailUrl: string | null;
  oldThumbnailFolderPath: string | null;
  videoUrl: string | null;
}

export interface UpdateYoutubeVideoContentPayload {
  title: string;
  description: string;
  tags: string[];
}

export interface MarkYoutubeVideoUploadedResponse {
  videoId: string;
  status: 'Uploaded';
  lastUploadAt: string;
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

export interface MetaStep1Beat {
  range: [number, number];
  role: 'setup' | 'conflict' | 'reveal' | 'reaction' | 'reversal' | 'resolution' | 'explanation' | 'transition';
  event: string;
  emotion: string;
}

export interface MetaStep1Character {
  name: string;
  role: string;
  relationship: string;
}

export interface MetaStep1CarryForward {
  last_event: string;
  active_conflict: string;
  open_threads: string[];
  important_visuals: string[];
}

export interface MetaStep1ChunkDigest {
  range: unknown;
  digest: unknown;
  beats: unknown;
  characters: unknown;
  key_facts: unknown;
  conflicts_and_reveals: unknown;
  emotion_arc: unknown;
  visual_anchors: unknown;
  carry_forward: unknown;
}

export interface MetaStep2StoryBlock {
  source_chunk_ids: unknown;
  range: unknown;
  story_block_summary: unknown;
  major_beats: unknown;
  main_characters: unknown;
  core_conflicts: unknown;
  important_reveals: unknown;
  emotional_arc: unknown;
  visual_candidates: unknown;
  open_threads: unknown;
}

export interface MetaStep2Section {
  section_id: string;
  title: string;
  summary: string;
  source_chunk_ids: number[];
  start_line: number;
  end_line: number;
  narrative_role: string;
  emotion_arc: string;
  main_points: string[];
  merged_entities: Array<{ name: string; type: string; confidence: number }>;
  visual_beats: string[];
  continuity_notes: string;
  confidence: number;
}

export interface MetaStep3HeroImagePrompt {
  prompt: unknown;
  concept?: unknown;
  main_subject?: unknown;
  supporting_elements?: unknown;
  negative_prompt?: unknown;
}

export interface MetaStep3FinalSummary {
  overview: unknown;
  key_takeaways: unknown;
  story_flow: unknown;
}

export interface MetaStep3Metadata {
  title: unknown;
  description: unknown;
  tags: unknown;
  title_candidates?: unknown;
  hook_angle?: unknown;
}

export interface MetaStep3Output {
  video_id: string;
  final_summary: MetaStep3FinalSummary;
  metadata: MetaStep3Metadata;
  hero_image_prompt: MetaStep3HeroImagePrompt;
}

export interface ThumbnailHorizontalCopy {
  line_1: string;
  line_2: string;
  line_3: string;
  twist_line: string;
}

export interface ThumbnailHorizontalStep1Output {
  detected_niche: string;
  sub_niche: string;
  dominant_emotion: string;
  secondary_emotion: string;
  core_conflict: string;
  clickable_reveal: string;
  best_thumbnail_moment: string;
  evidence_object: string;
  setting: string;
  characters: unknown;
  visual_tone: string;
  visual_scene: string;
  safe_visual_description: string;
  ctr_reasoning: unknown;
  thumbnail_angle: unknown;
  risk_flags: unknown;
  safety_notes: string;
}

export interface ThumbnailHorizontalStep2Output {
  thumbnail_copy: ThumbnailHorizontalCopy;
  copy_intent: unknown;
  length_check: unknown;
  safety_check: unknown;
}

export interface ThumbnailHorizontalStep3Output {
  thumbnail_copy: ThumbnailHorizontalCopy;
  layout_tokens: unknown;
  typography_tokens: unknown;
  color_strategy: unknown;
  visual_prompt: string;
  negative_prompt: string;
  image_generation_rules: unknown;
  renderer_notes: unknown;
}

export interface ThumbnailHorizontalPlan {
  thumbnailCopy: ThumbnailHorizontalCopy;
  colorStrategy: unknown;
  visualPrompt: string;
  negativePrompt: string;
}

export interface ThumbnailHorizontalOutput {
  step1: ThumbnailHorizontalStep1Output;
  step2: ThumbnailHorizontalStep2Output;
  step3: ThumbnailHorizontalStep3Output;
  plan: ThumbnailHorizontalPlan;
}

export interface ReupVideoOutputItem {
  link: string;
  channelId: string;
  language: string;
  videoId: string;
  youtubeVideoId: string;
  outputPath: string;
  thumbnailPath?: string;
  audioPath?: string;
  transcriptPath?: string;
  srtPath?: string;
  updatedSrtPath?: string;
  metaStep1ChunkDigests?: MetaStep1ChunkDigest[];
  metaStep2StoryBlocks?: MetaStep2StoryBlock[];
  metaStep3Output?: MetaStep3Output;
  thumbnailHorizontalOutput?: ThumbnailHorizontalOutput;
  heroImagePath?: string;
  thumbnailVisualPath?: string;
  reupThumbnailPath?: string;
  reupVideoPath?: string;
  videoPath?: string;
}

export interface CreateReupVideosResponse {
  items: ReupVideoOutputItem[];
}

export type ReupVideoBatchChannelStatus = 'created' | 'skipped' | 'failed';

export interface ReupVideoBatchChannelResult {
  channelId: string;
  channelName: string;
  status: ReupVideoBatchChannelStatus;
  items?: ReupVideoOutputItem[];
  reason?: string;
}

export interface CreateReupVideosBatchResponse {
  channels: ReupVideoBatchChannelResult[];
  items: ReupVideoOutputItem[];
}

export interface UploadYoutubeChannelBatchItem {
  channelId: string;
  ok: boolean;
  skipped?: boolean;
  result?: {
    channelId: string;
    uploaded: number;
    uploadedSuccessful: number;
    successfulVideoIds: string[];
  };
  error?: string;
}

export interface UploadYoutubeVideosBatchResponse {
  results: UploadYoutubeChannelBatchItem[];
}

export interface CreateYoutubeChannelPayload {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType;
  language: YoutubeChannelLanguage;
  niche: string;
  sourceChannels?: string[];
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  thumbnailBackgroundTempSessionId?: string;
  avatarTempSessionId?: string;
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

export type UpdateYoutubeChannelPayload = Omit<
  CreateYoutubeChannelPayload,
  'channelUrl' | 'thumbnailBackgroundTempSessionId' | 'avatarTempSessionId'
> & {
  /** Allowed when the channel currently uses the default linked email. */
  channelUrl?: string;
};

export interface AddYoutubeChannelFormValues {
  mailAccountId: string;
  channelUrl: string;
  type: YoutubeChannelType | '';
  language: YoutubeChannelLanguage | '';
  niche: string;
  sourceChannels: string[];
  videoCreationOrder: VideoCreationOrder;
  backgroundFootageSources: string[];
  thumbnailStyleKey: string;
  thumbnailBackgroundFile: string;
  captionStyleKey: CaptionStyleKey | '';
  reupAudioVideoType: ReupAudioVideoType | '';
  reupAudioVisualStyleId: string;
  /** Mode value (`no_image`/`one_image`/`multi_image`/`local_image`) or `celebrity:<id>`. */
  reupAudioBackgroundImage: string;
  aiSceneDensityMaxSec: AiSceneDensityMaxSec;
  useReferenceImage: boolean;
  audioBarFile: string;
  showChannelAvatar: boolean;
  showSubscribe: boolean;
  subscribeFile: string;
  smallVideoFile: string;
  showDisclaimer: boolean;
  disclaimerText: string;
  descriptionDisclaimerText: string;
  uploadFrequency: UploadFrequency | '';
  publishTimes: string[];
}

export interface ThumbnailBackgroundItem {
  name: string;
  url: string;
}

export interface ChannelAvatarItem {
  name: string;
  url: string;
}
