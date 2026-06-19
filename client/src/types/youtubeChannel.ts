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

export interface MetaStep1MicroSegment {
  segment_id: string;
  line_start: number;
  line_end: number;
  summary: string;
  key_points: Array<{ text: string; evidence_ids: number[] }>;
  events: Array<{ text: string; evidence_ids: number[] }>;
  entities: Array<{ name: string; type: string; evidence_ids: number[]; confidence: number }>;
  narrative_role: string;
  emotion: string[];
  topic: string;
  confidence: number;
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

export interface MetaStep3Chapter {
  chapter_id: string;
  title: string;
  summary: string;
  line_start: number;
  line_end: number;
  source_processing_chunk_ids: string[];
  source_segment_ids: string[];
  source_section_ids: string[];
  narrative_role: string;
  emotion_arc: string;
  main_points: string[];
  chapter_boundary_reason: string;
  visual_beats: string[];
}

export interface MetaStep3Output {
  video_id: string;
  final_summary: {
    overview: string;
    key_takeaways: string[];
    structured_sections: Array<{ heading: string; bullets: string[] }>;
  };
  metadata: {
    title: string;
    description: string;
    tags: string[];
    hook: string;
    ctr_strategy: string;
    search_suppression_notes: string[];
  };
  global_context: {
    niche: string;
    tone: string;
    audience: string;
    topic: string;
    language: string;
  };
  chapters: MetaStep3Chapter[];
  quality: {
    merged_redundancies: string[];
    ambiguous_points: string[];
    chaptering_notes: string[];
    confidence: number;
  };
}

export interface MetaStep4HeroImagePackage {
  concept: string;
  conflict_type: string;
  climactic_moment: string;
  narrative_purpose: string;
  why_this_works_for_full_video: string;
  composition: string;
  main_subject: string;
  secondary_elements: string[];
  environment: string;
  emotion: string;
  visual_density: string;
  evidence_object: {
    object: string;
    visual_role: string;
    placement: string;
    confidence: number;
  };
  character_blocking: {
    foreground: string;
    midground: string;
    background: string;
    power_dynamic: string;
    gaze_direction: string;
  };
  viewer_retention_strategy: string[];
  prompt: string;
  negative_prompt: string;
}

export interface MetaStep4Output {
  video_id: string;
  style: {
    name: string;
    preset: string;
    style_summary: string;
  };
  visual_bible: {
    overall_mood: string;
    genre_visual_direction: string;
    color_palette: string[];
    lighting_style: string;
    camera_language: string[];
    composition_rules: string[];
    texture_and_materials: string[];
    visual_motifs: string[];
    visual_consistency_rules: string[];
  };
  character_designs: Array<{
    character_id: string;
    name: string;
    role: string;
    importance: 'primary' | 'secondary' | 'supporting';
    age_range: string;
    appearance: string;
    face_features: string;
    hair: string;
    body_type: string;
    wardrobe: string;
    signature_prop: string;
    expression_range: string[];
    body_language: string[];
    consistency_notes: string;
    do_not_change: string[];
    confidence: number;
  }>;
  environment_design: {
    primary_locations: Array<{
      location_id: string;
      name: string;
      description: string;
      mood: string;
      recurring_visual_elements: string[];
      cultural_context: string;
      consistency_notes: string;
    }>;
    time_period: string;
    overall_cultural_context: string;
  };
  chapter_visual_plan: Array<{
    chapter_id: string;
    line_start: number;
    line_end: number;
    source_segment_ids: string[];
    visual_goal: string;
    scene_description: string;
    composition: string;
    lighting: string;
    color_notes: string;
    characters_present: string[];
    location_id: string;
    emotion_to_show: string;
    visual_keywords: string[];
    scene_image_prompt_brief: string;
    avoid: string[];
  }>;
  hero_image_package: MetaStep4HeroImagePackage;
  quality: {
    story_grounded_visuals: string[];
    assumptions: string[];
    uncertain_visual_details: string[];
    possible_risks: string[];
    confidence: number;
  };
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
  metaStep1MicroSegments?: MetaStep1MicroSegment[];
  metaStep3Output?: MetaStep3Output;
  metaStep4Output?: MetaStep4Output;
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
