import type { LlmBrowserResponse } from '../../infrastructure/llm-browser/llm-browser.types.js';
import type { SrtBlock } from '../../infrastructure/subtitle/srt-utils.js';
import type {
  MetaStep1BeatRole,
  MetaStep1ChunkDigest,
  MetaStep2StoryBlock,
  MetaStep3Chapter,
  MetaStep3HeroImagePrompt,
  MetaStep3LegacyOutput,
  MetaStep3Output,
  MetaStep4Output,
} from './reup-metadata.types.js';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

function extractJsonText(response: LlmBrowserResponse): string {
  for (let i = response.codeBlocks.length - 1; i >= 0; i -= 1) {
    const block = response.codeBlocks[i].trim();
    if (block.includes('{')) {
      return stripMarkdownFences(block);
    }
  }
  return stripMarkdownFences(response.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.every(key => key in value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

const META_STEP1_BEAT_ROLES = new Set<MetaStep1BeatRole>([
  'setup',
  'conflict',
  'reveal',
  'reaction',
  'reversal',
  'resolution',
  'explanation',
  'transition',
]);

function validateBeatRange(value: unknown, batchLineStart: number, batchLineEnd: number): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [start, end] = value;
  if (typeof start !== 'number' || typeof end !== 'number') return false;
  if (start > end) return false;
  return start >= batchLineStart && end <= batchLineEnd;
}

function validateBeat(value: unknown, batchLineStart: number, batchLineEnd: number): boolean {
  if (!isRecord(value)) return false;
  return (
    validateBeatRange(value.range, batchLineStart, batchLineEnd) &&
    typeof value.role === 'string' &&
    META_STEP1_BEAT_ROLES.has(value.role as MetaStep1BeatRole) &&
    typeof value.event === 'string' &&
    value.event.trim().length > 0 &&
    typeof value.emotion === 'string'
  );
}

function validateCharacter(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string' && typeof value.role === 'string' && typeof value.relationship === 'string';
}

function validateCarryForward(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.last_event === 'string' &&
    typeof value.active_conflict === 'string' &&
    isStringArray(value.open_threads) &&
    value.open_threads.length <= 4 &&
    isStringArray(value.important_visuals) &&
    value.important_visuals.length <= 4
  );
}

function validateStringArrayMax(value: unknown, max: number): boolean {
  return isStringArray(value) && value.length <= max && value.every(item => item.trim().length > 0);
}

const STEP1_REQUIRED_KEYS = [
  'range',
  'digest',
  'beats',
  'characters',
  'key_facts',
  'conflicts_and_reveals',
  'emotion_arc',
  'visual_anchors',
  'carry_forward',
] as const;

export function tryParseMetaStep1Response(response: LlmBrowserResponse, batchBlocks: SrtBlock[]): MetaStep1ChunkDigest | null {
  if (batchBlocks.length === 0) return null;

  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, STEP1_REQUIRED_KEYS)) return null;

  return parsed as unknown as MetaStep1ChunkDigest;
}

function validateStringArrayMaxOptional(value: unknown, max: number): boolean {
  if (!isStringArray(value) || value.length > max) return false;
  return value.every(item => item.trim().length > 0);
}

function chunkDigestRangeId(digest: MetaStep1ChunkDigest): string {
  const range = digest.range as [number, number];
  return `${range[0]}-${range[1]}`;
}

function resolveChunkDigestBatchRange(batchChunkDigests: MetaStep1ChunkDigest[]): {
  batchLineStart: number;
  batchLineEnd: number;
  expectedSourceChunkIds: string[];
} | null {
  if (batchChunkDigests.length === 0) return null;
  const firstRange = batchChunkDigests[0].range as [number, number];
  const lastRange = batchChunkDigests[batchChunkDigests.length - 1].range as [number, number];
  return {
    batchLineStart: firstRange[0],
    batchLineEnd: lastRange[1],
    expectedSourceChunkIds: batchChunkDigests.map(chunkDigestRangeId),
  };
}

function validateSourceChunkIds(value: unknown, expectedChunkIds: string[]): boolean {
  if (!isStringArray(value) || value.length !== expectedChunkIds.length) return false;
  const expected = new Set(expectedChunkIds);
  return value.every(chunkId => expected.has(chunkId));
}

const STEP2_REQUIRED_KEYS = [
  'source_chunk_ids',
  'range',
  'story_block_summary',
  'major_beats',
  'main_characters',
  'core_conflicts',
  'important_reveals',
  'emotional_arc',
  'visual_candidates',
  'open_threads',
] as const;

export function tryParseMetaStep2Response(
  response: LlmBrowserResponse,
  batchChunkDigests: MetaStep1ChunkDigest[],
): MetaStep2StoryBlock | null {
  if (batchChunkDigests.length === 0) return null;

  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, STEP2_REQUIRED_KEYS)) return null;

  return parsed as unknown as MetaStep2StoryBlock;
}

function validateStringArrayLength(value: unknown, min: number, max: number): boolean {
  if (!isStringArray(value) || value.length < min || value.length > max) return false;
  return value.every(item => item.trim().length > 0);
}

function validateStep3FinalSummary(value: unknown): boolean {
  return hasRequiredKeys(value, ['overview', 'key_takeaways', 'story_flow']);
}

function validateStep3Metadata(value: unknown): boolean {
  return hasRequiredKeys(value, ['title', 'description', 'tags']);
}

function validateHeroImagePrompt(value: unknown): boolean {
  return hasRequiredKeys(value, ['prompt']);
}

export function tryParseMetaStep3Response(response: LlmBrowserResponse, videoId: string): MetaStep3Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, ['final_summary', 'metadata', 'hero_image_prompt'])) return null;
  if (!validateStep3FinalSummary(parsed.final_summary)) return null;
  if (!validateStep3Metadata(parsed.metadata)) return null;
  if (!validateHeroImagePrompt(parsed.hero_image_prompt)) return null;

  return {
    final_summary: parsed.final_summary as MetaStep3Output['final_summary'],
    metadata: parsed.metadata as MetaStep3Output['metadata'],
    hero_image_prompt: parsed.hero_image_prompt as MetaStep3HeroImagePrompt,
  };
}

/** @deprecated Legacy step 3 validators — kept for step 4 parser */
function validateStructuredSection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.heading === 'string' && value.heading.trim().length > 0 && isStringArray(value.bullets);
}

function validateLegacyFinalSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.overview === 'string' &&
    value.overview.trim().length > 0 &&
    isStringArray(value.key_takeaways) &&
    Array.isArray(value.structured_sections) &&
    value.structured_sections.every(validateStructuredSection)
  );
}

function validateLegacyMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.description === 'string' &&
    value.description.trim().length > 0 &&
    isStringArray(value.tags) &&
    value.tags.length <= 8 &&
    typeof value.hook === 'string' &&
    value.hook.trim().length > 0 &&
    typeof value.ctr_strategy === 'string' &&
    value.ctr_strategy.trim().length > 0 &&
    isStringArray(value.search_suppression_notes)
  );
}

function validateGlobalContext(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.niche === 'string' &&
    typeof value.tone === 'string' &&
    typeof value.audience === 'string' &&
    typeof value.topic === 'string' &&
    typeof value.language === 'string'
  );
}

function validateChapter(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.chapter_id === 'string' &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.summary === 'string' &&
    value.summary.trim().length > 0 &&
    typeof value.line_start === 'number' &&
    typeof value.line_end === 'number' &&
    value.line_start <= value.line_end &&
    isStringArray(value.source_processing_chunk_ids) &&
    isStringArray(value.source_segment_ids) &&
    isStringArray(value.source_section_ids) &&
    typeof value.narrative_role === 'string' &&
    typeof value.emotion_arc === 'string' &&
    isStringArray(value.main_points) &&
    typeof value.chapter_boundary_reason === 'string' &&
    isStringArray(value.visual_beats)
  );
}

function validateStep3Quality(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.merged_redundancies) &&
    isStringArray(value.ambiguous_points) &&
    isStringArray(value.chaptering_notes) &&
    typeof value.confidence === 'number'
  );
}

export function tryParseMetaStep3LegacyResponse(response: LlmBrowserResponse, videoId: string): MetaStep3LegacyOutput | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!validateLegacyFinalSummary(parsed.final_summary)) return null;
  if (!validateLegacyMetadata(parsed.metadata)) return null;
  if (!validateGlobalContext(parsed.global_context)) return null;
  if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) return null;

  return {
    video_id: typeof parsed.video_id === 'string' ? parsed.video_id : videoId,
    final_summary: parsed.final_summary as MetaStep3LegacyOutput['final_summary'],
    metadata: parsed.metadata as MetaStep3LegacyOutput['metadata'],
    global_context: parsed.global_context as MetaStep3LegacyOutput['global_context'],
    chapters: parsed.chapters as MetaStep3LegacyOutput['chapters'],
    quality: parsed?.quality as MetaStep3LegacyOutput['quality'],
  };
}

const CHARACTER_IMPORTANCE = new Set(['primary', 'secondary', 'supporting']);

function stringArraysEqual(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((item, index) => typeof item === 'string' && item === b[index]);
}

function validateStep4Style(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.preset === 'string' &&
    typeof value.style_summary === 'string' &&
    value.style_summary.trim().length > 0
  );
}

function validateVisualBible(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.overall_mood === 'string' &&
    typeof value.genre_visual_direction === 'string' &&
    isStringArray(value.color_palette) &&
    typeof value.lighting_style === 'string' &&
    isStringArray(value.camera_language) &&
    isStringArray(value.composition_rules) &&
    isStringArray(value.texture_and_materials) &&
    isStringArray(value.visual_motifs) &&
    isStringArray(value.visual_consistency_rules)
  );
}

function validateCharacterDesign(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.character_id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.role === 'string' &&
    typeof value.importance === 'string' &&
    CHARACTER_IMPORTANCE.has(value.importance) &&
    typeof value.age_range === 'string' &&
    typeof value.appearance === 'string' &&
    typeof value.face_features === 'string' &&
    typeof value.hair === 'string' &&
    typeof value.body_type === 'string' &&
    typeof value.wardrobe === 'string' &&
    typeof value.signature_prop === 'string' &&
    isStringArray(value.expression_range) &&
    isStringArray(value.body_language) &&
    typeof value.consistency_notes === 'string' &&
    isStringArray(value.do_not_change) &&
    typeof value.confidence === 'number'
  );
}

function validateLocation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.location_id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.mood === 'string' &&
    isStringArray(value.recurring_visual_elements) &&
    typeof value.cultural_context === 'string' &&
    typeof value.consistency_notes === 'string'
  );
}

function validateEnvironmentDesign(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.primary_locations) &&
    value.primary_locations.every(validateLocation) &&
    typeof value.time_period === 'string' &&
    typeof value.overall_cultural_context === 'string'
  );
}

function validateChapterVisualPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.chapter_id === 'string' &&
    typeof value.line_start === 'number' &&
    typeof value.line_end === 'number' &&
    value.line_start <= value.line_end &&
    isStringArray(value.source_segment_ids) &&
    typeof value.visual_goal === 'string' &&
    typeof value.scene_description === 'string' &&
    typeof value.composition === 'string' &&
    typeof value.lighting === 'string' &&
    typeof value.color_notes === 'string' &&
    isStringArray(value.characters_present) &&
    typeof value.location_id === 'string' &&
    typeof value.emotion_to_show === 'string' &&
    isStringArray(value.visual_keywords) &&
    typeof value.scene_image_prompt_brief === 'string' &&
    isStringArray(value.avoid)
  );
}

function validateEvidenceObject(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.object === 'string' &&
    typeof value.visual_role === 'string' &&
    typeof value.placement === 'string' &&
    typeof value.confidence === 'number'
  );
}

function validateCharacterBlocking(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.foreground === 'string' &&
    typeof value.midground === 'string' &&
    typeof value.background === 'string' &&
    typeof value.power_dynamic === 'string' &&
    typeof value.gaze_direction === 'string'
  );
}

function validateHeroImagePackage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.concept === 'string' &&
    typeof value.conflict_type === 'string' &&
    typeof value.climactic_moment === 'string' &&
    typeof value.narrative_purpose === 'string' &&
    typeof value.why_this_works_for_full_video === 'string' &&
    typeof value.composition === 'string' &&
    typeof value.main_subject === 'string' &&
    isStringArray(value.secondary_elements) &&
    typeof value.environment === 'string' &&
    typeof value.emotion === 'string' &&
    typeof value.visual_density === 'string' &&
    validateEvidenceObject(value.evidence_object) &&
    validateCharacterBlocking(value.character_blocking) &&
    isStringArray(value.viewer_retention_strategy) &&
    typeof value.prompt === 'string' &&
    value.prompt.trim().length > 0 &&
    typeof value.negative_prompt === 'string' &&
    value.negative_prompt.trim().length > 0
  );
}

function validateStep4Quality(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.story_grounded_visuals) &&
    isStringArray(value.assumptions) &&
    isStringArray(value.uncertain_visual_details) &&
    isStringArray(value.possible_risks) &&
    typeof value.confidence === 'number'
  );
}

function validateChapterVisualPlansMatchStep3(plans: unknown[], step3Chapters: MetaStep3Chapter[]): boolean {
  if (plans.length !== step3Chapters.length) return false;

  for (let index = 0; index < step3Chapters.length; index += 1) {
    const plan = plans[index];
    const chapter = step3Chapters[index];
    if (!isRecord(plan)) return false;
    if (plan.chapter_id !== chapter.chapter_id) return false;
    if (plan.line_start !== chapter.line_start) return false;
    if (plan.line_end !== chapter.line_end) return false;
    if (!stringArraysEqual(plan.source_segment_ids, chapter.source_segment_ids)) return false;
  }

  return true;
}

export function tryParseMetaStep4Response(
  response: LlmBrowserResponse,
  videoId: string,
  step3Output: MetaStep3LegacyOutput,
): MetaStep4Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!validateStep4Style(parsed.style)) return null;
  if (!validateVisualBible(parsed.visual_bible)) return null;
  if (!Array.isArray(parsed.character_designs) || !parsed.character_designs.every(validateCharacterDesign)) return null;
  if (!validateEnvironmentDesign(parsed.environment_design)) return null;
  if (!Array.isArray(parsed.chapter_visual_plan) || parsed.chapter_visual_plan.length === 0) return null;
  if (!parsed.chapter_visual_plan.every(validateChapterVisualPlan)) return null;
  if (!validateChapterVisualPlansMatchStep3(parsed.chapter_visual_plan, step3Output.chapters)) return null;
  if (!validateHeroImagePackage(parsed.hero_image_package)) return null;
  if (!validateStep4Quality(parsed.quality)) return null;

  return {
    video_id: typeof parsed.video_id === 'string' ? parsed.video_id : videoId,
    style: parsed.style as MetaStep4Output['style'],
    visual_bible: parsed.visual_bible as MetaStep4Output['visual_bible'],
    character_designs: parsed.character_designs as MetaStep4Output['character_designs'],
    environment_design: parsed.environment_design as MetaStep4Output['environment_design'],
    chapter_visual_plan: parsed.chapter_visual_plan as MetaStep4Output['chapter_visual_plan'],
    hero_image_package: parsed.hero_image_package as MetaStep4Output['hero_image_package'],
    quality: parsed.quality as MetaStep4Output['quality'],
  };
}
