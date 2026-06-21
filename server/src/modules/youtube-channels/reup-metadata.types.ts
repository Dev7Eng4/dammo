import type { PromptLanguage } from '../prompts/prompts.types.js';

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

export interface MetaStep3PersistedOutput {
  videoId: string;
  language: PromptLanguage;
  generatedAt: string;
  result: MetaStep3Output;
}

export interface MetaPipelineResult {
  step3: MetaStep3Output;
}
