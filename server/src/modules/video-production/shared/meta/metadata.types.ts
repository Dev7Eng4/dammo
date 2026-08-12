import type { PromptLanguage } from '../../../prompts/prompts.types.js';

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
  final_summary: MetaStep3FinalSummary;
  metadata: MetaStep3Metadata;
  hero_image_prompt: MetaStep3HeroImagePrompt;
}

/** Niche UUID for "Lời dạy người nổi tiếng" (niches.json + metadata_loi_day prompt). */
export const CELEBRITY_WISDOM_NICHE_ID = 'a073ce74-07d7-4386-b59a-cb15a4fb2d99';

export function isCelebrityWisdomNiche(niche?: string): boolean {
  return (niche?.trim() || '') === CELEBRITY_WISDOM_NICHE_ID;
}

export interface CelebrityWisdomThumbnailLine {
  text: string;
  color: string;
}

export interface CelebrityWisdomThumbnailSpec {
  text: string;
  lines: CelebrityWisdomThumbnailLine[];
  font_style: string;
  font_characteristics: string;
  text_effect: string;
  background: string;
  character_position: string;
  text_position: string;
  visual_strategy: string;
  image_generation_prompt?: string;
}

export interface MetadataLlmOutput {
  detected_niche: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
  };
  alternative_titles: string[];
  /** Celebrity-wisdom niche fields (optional on other niches). */
  detected_topic?: string;
  detected_name?: string;
  framing?: string;
  core_promise?: string;
  recommended_title_index?: number;
  thumbnail?: CelebrityWisdomThumbnailSpec;
  image_generation_prompt?: string;
  /** Drama / niche meta: prompt for SI one_image background (no typography). */
  video_visual_prompt?: string;
}

export interface MetadataPersistedOutput extends MetadataLlmOutput {
  videoId: string;
  language: PromptLanguage;
  source_title: string;
}

/** Unified video-meta shape supporting both legacy step-3 and new single-step metadata */
export interface VideoMetaOutput {
  metadata: MetaStep3Metadata;
  source_title?: string;
  detected_niche?: string;
  alternative_titles?: string[];
  final_summary?: MetaStep3FinalSummary;
  hero_image_prompt?: MetaStep3HeroImagePrompt;
  detected_topic?: string;
  detected_name?: string;
  framing?: string;
  core_promise?: string;
  recommended_title_index?: number;
  thumbnail?: CelebrityWisdomThumbnailSpec;
  image_generation_prompt?: string;
  video_visual_prompt?: string;
}

export function hasLegacyVisualMeta(meta: VideoMetaOutput): meta is MetaStep3Output {
  return meta.final_summary != null && meta.hero_image_prompt != null;
}

/** @deprecated Legacy shape kept for reading old video-meta.json files */
export interface LegacyMetaStep3PersistedOutput {
  videoId: string;
  language: PromptLanguage;
  generatedAt?: string;
  result?: MetaStep3Output;
}

function pickOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function pickImageGenerationPrompt(record: Record<string, unknown>): string | undefined {
  const topLevel = pickOptionalString(record, 'image_generation_prompt')?.trim();
  if (topLevel) return topLevel;

  const thumbnail = record.thumbnail;
  if (thumbnail && typeof thumbnail === 'object' && !Array.isArray(thumbnail)) {
    const nested = pickOptionalString(thumbnail as Record<string, unknown>, 'image_generation_prompt')?.trim();
    if (nested) return nested;
  }

  return undefined;
}

function pickWisdomMetaFields(record: Record<string, unknown>): Partial<VideoMetaOutput> {
  const fields: Partial<VideoMetaOutput> = {};
  const detectedTopic = pickOptionalString(record, 'detected_topic');
  const detectedName = pickOptionalString(record, 'detected_name');
  const framing = pickOptionalString(record, 'framing');
  const corePromise = pickOptionalString(record, 'core_promise');
  const imagePrompt = pickImageGenerationPrompt(record);
  const videoVisualPrompt = pickOptionalString(record, 'video_visual_prompt');
  if (detectedTopic !== undefined) fields.detected_topic = detectedTopic;
  if (detectedName !== undefined) fields.detected_name = detectedName;
  if (framing !== undefined) fields.framing = framing;
  if (corePromise !== undefined) fields.core_promise = corePromise;
  if (imagePrompt !== undefined) fields.image_generation_prompt = imagePrompt;
  if (videoVisualPrompt !== undefined) fields.video_visual_prompt = videoVisualPrompt;
  if (typeof record.recommended_title_index === 'number' && Number.isFinite(record.recommended_title_index)) {
    fields.recommended_title_index = record.recommended_title_index;
  }
  if (record.thumbnail && typeof record.thumbnail === 'object') {
    fields.thumbnail = record.thumbnail as CelebrityWisdomThumbnailSpec;
  }
  if (Array.isArray(record.alternative_titles)) {
    fields.alternative_titles = record.alternative_titles as string[];
  }
  return fields;
}

export function parseVideoMetaContent(raw: unknown): VideoMetaOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid video-meta.json: expected object');
  }

  const record = raw as LegacyMetaStep3PersistedOutput & MetadataPersistedOutput & Record<string, unknown>;

  if (record.result && typeof record.result === 'object') {
    const result = record.result;
    return {
      metadata: result.metadata,
      final_summary: result.final_summary,
      hero_image_prompt: result.hero_image_prompt,
    };
  }

  if (
    'final_summary' in record &&
    'metadata' in record &&
    'hero_image_prompt' in record
  ) {
    return {
      final_summary: record.final_summary as MetaStep3FinalSummary,
      metadata: record.metadata as MetaStep3Metadata,
      hero_image_prompt: record.hero_image_prompt as MetaStep3HeroImagePrompt,
    };
  }

  if ('metadata' in record && record.metadata) {
    return {
      ...(typeof record.source_title === 'string' && record.source_title.trim()
        ? { source_title: record.source_title.trim() }
        : {}),
      ...(typeof record.detected_niche === 'string' ? { detected_niche: record.detected_niche } : {}),
      metadata: record.metadata as MetaStep3Metadata,
      ...pickWisdomMetaFields(record),
      ...(Array.isArray(record.alternative_titles)
        ? { alternative_titles: record.alternative_titles }
        : {}),
    };
  }

  throw new Error('Invalid video-meta.json: missing metadata fields');
}
