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

/** @deprecated Legacy step 3 chaptering — kept for step 4 types only */
export interface MetaStep3StructuredSection {
  heading: string;
  bullets: string[];
}

/** @deprecated Legacy step 3 final summary */
export interface MetaStep3LegacyFinalSummary {
  overview: string;
  key_takeaways: string[];
  structured_sections: MetaStep3StructuredSection[];
}

/** @deprecated Legacy step 3 metadata */
export interface MetaStep3LegacyMetadata {
  title: string;
  description: string;
  tags: string[];
  hook: string;
  ctr_strategy: string;
  search_suppression_notes: string[];
}

/** @deprecated Legacy step 3 global context */
export interface MetaStep3GlobalContext {
  niche: string;
  tone: string;
  audience: string;
  topic: string;
  language: string;
}

/** @deprecated Legacy step 3 chapter */
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

/** @deprecated Legacy step 3 quality */
export interface MetaStep3Quality {
  merged_redundancies: string[];
  ambiguous_points: string[];
  chaptering_notes: string[];
  confidence: number;
}

/** @deprecated Legacy step 3 output — kept for step 4 parser only */
export interface MetaStep3LegacyOutput {
  video_id: string;
  final_summary: MetaStep3LegacyFinalSummary;
  metadata: MetaStep3LegacyMetadata;
  global_context: MetaStep3GlobalContext;
  chapters: MetaStep3Chapter[];
  quality: MetaStep3Quality;
}

export type MetaStep4CharacterImportance = 'primary' | 'secondary' | 'supporting';

export interface MetaStep4Style {
  name: string;
  preset: string;
  style_summary: string;
}

export interface MetaStep4VisualBible {
  overall_mood: string;
  genre_visual_direction: string;
  color_palette: string[];
  lighting_style: string;
  camera_language: string[];
  composition_rules: string[];
  texture_and_materials: string[];
  visual_motifs: string[];
  visual_consistency_rules: string[];
}

export interface MetaStep4CharacterDesign {
  character_id: string;
  name: string;
  role: string;
  importance: MetaStep4CharacterImportance;
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
}

export interface MetaStep4Location {
  location_id: string;
  name: string;
  description: string;
  mood: string;
  recurring_visual_elements: string[];
  cultural_context: string;
  consistency_notes: string;
}

export interface MetaStep4EnvironmentDesign {
  primary_locations: MetaStep4Location[];
  time_period: string;
  overall_cultural_context: string;
}

export interface MetaStep4ChapterVisualPlan {
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
}

export interface MetaStep4EvidenceObject {
  object: string;
  visual_role: string;
  placement: string;
  confidence: number;
}

export interface MetaStep4CharacterBlocking {
  foreground: string;
  midground: string;
  background: string;
  power_dynamic: string;
  gaze_direction: string;
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
  evidence_object: MetaStep4EvidenceObject;
  character_blocking: MetaStep4CharacterBlocking;
  viewer_retention_strategy: string[];
  prompt: string;
  negative_prompt: string;
}

export interface MetaStep4Quality {
  story_grounded_visuals: string[];
  assumptions: string[];
  uncertain_visual_details: string[];
  possible_risks: string[];
  confidence: number;
}

export interface MetaStep4Output {
  video_id: string;
  style: MetaStep4Style;
  visual_bible: MetaStep4VisualBible;
  character_designs: MetaStep4CharacterDesign[];
  environment_design: MetaStep4EnvironmentDesign;
  chapter_visual_plan: MetaStep4ChapterVisualPlan[];
  hero_image_package: MetaStep4HeroImagePackage;
  quality: MetaStep4Quality;
}

export interface MetaStep4PersistedOutput {
  videoId: string;
  language: PromptLanguage;
  generatedAt: string;
  result: MetaStep4Output;
}

export interface MetaPipelineResult {
  step3: MetaStep3Output;
}
