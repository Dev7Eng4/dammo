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
  /** Resolved server-side for list responses */
  sourceNames?: string[];
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

export type YoutubeChannelVideoStatus = 'Published' | 'Prepared' | 'Created' | 'Uploaded' | 'Error';

export type YoutubeChannelVideoStatusFilter = 'all' | YoutubeChannelVideoStatus | 'Draft';

export const YOUTUBE_CHANNEL_VIDEO_STATUS_FILTER_OPTIONS: {
  value: YoutubeChannelVideoStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All Status' },
  { value: 'Published', label: 'Published' },
  { value: 'Prepared', label: 'Prepared' },
  { value: 'Created', label: 'Created' },
  { value: 'Uploaded', label: 'Uploaded' },
  { value: 'Error', label: 'Error' },
  { value: 'Draft', label: 'Draft' },
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
