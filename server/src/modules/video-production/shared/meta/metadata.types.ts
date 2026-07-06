import type { PromptLanguage } from '../../../prompts/prompts.types.js';

export type MetaStep1BeatRole = 'setup' | 'conflict' | 'reveal' | 'reaction' | 'reversal' | 'resolution' | 'explanation' | 'transition';

export interface MetaStep1Beat {
  range: [number, number];
  role: MetaStep1BeatRole;
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

export interface MetaStep1KeyPoint {
  text: string;
  evidence_ids: number[];
}

export interface MetaStep1Event {
  text: string;
  evidence_ids: number[];
}

export interface MetaStep1Entity {
  name: string;
  type: string;
  evidence_ids: number[];
  confidence: number;
}

export interface MetaStep1ChapterBoundarySignal {
  before_segment: string;
  after_segment: string;
  reason: string;
}

export interface MetaStep1VisualCue {
  text: string;
  source: 'explicit' | 'inferred';
}

export interface MetaStep1MicroSegment {
  segment_id: string;
  line_start: number;
  line_end: number;
  summary: string;
  key_points: MetaStep1KeyPoint[];
  events: MetaStep1Event[];
  entities: MetaStep1Entity[];
  narrative_role: string;
  emotion: string[];
  topic: string;
  chapter_boundary_signal?: MetaStep1ChapterBoundarySignal;
  visual_cues?: MetaStep1VisualCue[];
  confidence: number;
}

export interface MetaStep1ContinuityNotes {
  starts_mid_context: boolean;
  ends_mid_context: boolean;
  notes: string;
}

export interface MetaStep1Quality {
  ambiguous_points: string[];
  confidence: number;
}

export interface MetaStep1ChunkAnalysis {
  processing_chunk_id?: string;
  line_start: number;
  line_end: number;
  overall_summary?: string;
  micro_segments: MetaStep1MicroSegment[];
  continuity_notes?: MetaStep1ContinuityNotes;
  quality?: MetaStep1Quality;
}

export interface MetaStep1Output {
  videoId: string;
  language: PromptLanguage;
  generatedAt: string;
  chunk_digests: MetaStep1ChunkDigest[];
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

export interface MetaStep2MergedEntity {
  name: string;
  type: string;
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
  merged_entities: MetaStep2MergedEntity[];
  visual_beats: string[];
  continuity_notes: string;
  confidence: number;
}

export interface MetaStep2Quality {
  merged_redundancies: string[];
  ambiguous_points: string[];
  confidence: number;
}

export interface MetaStep2BatchAnalysis {
  video_id?: string;
  group_id?: string;
  sections: MetaStep2Section[];
  quality?: MetaStep2Quality;
}

export interface MetaStep2Output {
  videoId: string;
  language: PromptLanguage;
  generatedAt: string;
  story_blocks: MetaStep2StoryBlock[];
}

export type MetaSynthesisInput =
  | { micro_segments: MetaStep1MicroSegment[] }
  | { sections: MetaStep2Section[] }
  | { chunk_digests: MetaStep1ChunkDigest[] }
  | { story_blocks: MetaStep2StoryBlock[] };

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

export interface MetadataLlmOutput {
  detected_niche: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
  };
  alternative_titles: string[];
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
}

export function hasLegacyVisualMeta(meta: VideoMetaOutput): meta is MetaStep3Output {
  return meta.final_summary != null && meta.hero_image_prompt != null;
}

export interface MetaStep3PersistedOutput extends MetaStep3Output {
  videoId: string;
  language: PromptLanguage;
}

/** @deprecated Legacy shape kept for reading old video-meta.json files */
export interface LegacyMetaStep3PersistedOutput {
  videoId: string;
  language: PromptLanguage;
  generatedAt?: string;
  result?: MetaStep3Output;
}

export function parseVideoMetaContent(raw: unknown): VideoMetaOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid video-meta.json: expected object');
  }

  const record = raw as LegacyMetaStep3PersistedOutput & MetadataPersistedOutput;

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

  if ('detected_niche' in record && 'metadata' in record && 'alternative_titles' in record) {
    return {
      ...(typeof record.source_title === 'string' && record.source_title.trim()
        ? { source_title: record.source_title.trim() }
        : {}),
      detected_niche: record.detected_niche,
      metadata: record.metadata as MetaStep3Metadata,
      alternative_titles: record.alternative_titles,
    };
  }

  throw new Error('Invalid video-meta.json: missing metadata fields');
}

export interface MetaPipelineResult {
  step3: MetaStep3Output;
}

export interface GeneralImageLlmOutput {
  image_prompt: string;
}
