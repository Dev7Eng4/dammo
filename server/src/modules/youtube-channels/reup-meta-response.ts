import type { LlmBrowserResponse } from '../../infrastructure/llm-browser/llm-browser.types.js';
import type { SrtBlock } from '../../infrastructure/subtitle/srt-utils.js';
import type { MetaStep1ChunkAnalysis, MetaStep1MicroSegment, MetaStep2BatchAnalysis, MetaStep3Chapter, MetaStep3Output, MetaStep4Output } from './reup-metadata.types.js';

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function validateKeyPoints(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    item =>
      isRecord(item) &&
      typeof item.text === 'string' &&
      item.text.trim().length > 0 &&
      isNumberArray(item.evidence_ids),
  );
}

function validateEvents(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    item =>
      isRecord(item) &&
      typeof item.text === 'string' &&
      item.text.trim().length > 0 &&
      isNumberArray(item.evidence_ids),
  );
}

function validateEntities(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    item =>
      isRecord(item) &&
      typeof item.name === 'string' &&
      typeof item.type === 'string' &&
      isNumberArray(item.evidence_ids) &&
      typeof item.confidence === 'number',
  );
}

function validateMicroSegment(segment: unknown): boolean {
  if (!isRecord(segment)) return false;
  return (
    typeof segment.segment_id === 'string' &&
    typeof segment.line_start === 'number' &&
    typeof segment.line_end === 'number' &&
    typeof segment.summary === 'string' &&
    segment.summary.trim().length > 0 &&
    validateKeyPoints(segment.key_points) &&
    validateEvents(segment.events) &&
    validateEntities(segment.entities) &&
    typeof segment.narrative_role === 'string' &&
    isStringArray(segment.emotion) &&
    typeof segment.topic === 'string' &&
    typeof segment.confidence === 'number'
  );
}

function validateContinuityNotes(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.starts_mid_context === 'boolean' &&
    typeof value.ends_mid_context === 'boolean' &&
    typeof value.notes === 'string'
  );
}

function validateQuality(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isStringArray(value.ambiguous_points) && typeof value.confidence === 'number';
}

export function tryParseMetaStep1Response(
  response: LlmBrowserResponse,
  batchBlocks: SrtBlock[],
  processingChunkId: string,
): MetaStep1ChunkAnalysis | null {
  if (batchBlocks.length === 0) return null;

  const batchLineStart = batchBlocks[0].index;
  const batchLineEnd = batchBlocks[batchBlocks.length - 1].index;
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!Array.isArray(parsed.micro_segments) || parsed.micro_segments.length === 0) return null;
  if (!parsed.micro_segments.every(validateMicroSegment)) return null;
  if (!validateContinuityNotes(parsed.continuity_notes)) return null;
  if (!validateQuality(parsed.quality)) return null;
  if (typeof parsed.overall_summary !== 'string' || parsed.overall_summary.trim().length === 0) return null;

  const lineStart = typeof parsed.line_start === 'number' ? parsed.line_start : batchLineStart;
  const lineEnd = typeof parsed.line_end === 'number' ? parsed.line_end : batchLineEnd;
  if (lineStart < batchLineStart || lineEnd > batchLineEnd || lineStart > lineEnd) {
    return null;
  }

  return {
    processing_chunk_id: processingChunkId,
    line_start: lineStart,
    line_end: lineEnd,
    overall_summary: parsed.overall_summary.trim(),
    micro_segments: parsed.micro_segments as MetaStep1ChunkAnalysis['micro_segments'],
    continuity_notes: parsed.continuity_notes as MetaStep1ChunkAnalysis['continuity_notes'],
    quality: parsed.quality as MetaStep1ChunkAnalysis['quality'],
  };
}

function validateMergedEntity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    typeof value.confidence === 'number'
  );
}

function validateStep2Quality(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.merged_redundancies) &&
    isStringArray(value.ambiguous_points) &&
    typeof value.confidence === 'number'
  );
}

function validateSection(section: unknown, batchLineStart: number, batchLineEnd: number): boolean {
  if (!isRecord(section)) return false;
  return (
    typeof section.section_id === 'string' &&
    typeof section.title === 'string' &&
    section.title.trim().length > 0 &&
    typeof section.summary === 'string' &&
    section.summary.trim().length > 0 &&
    isNumberArray(section.source_chunk_ids) &&
    typeof section.start_line === 'number' &&
    typeof section.end_line === 'number' &&
    section.start_line >= batchLineStart &&
    section.end_line <= batchLineEnd &&
    section.start_line <= section.end_line &&
    typeof section.narrative_role === 'string' &&
    typeof section.emotion_arc === 'string' &&
    isStringArray(section.main_points) &&
    Array.isArray(section.merged_entities) &&
    section.merged_entities.every(validateMergedEntity) &&
    isStringArray(section.visual_beats) &&
    typeof section.continuity_notes === 'string' &&
    typeof section.confidence === 'number'
  );
}

function resolveBatchLineRange(batchMicroSegments: MetaStep1MicroSegment[]): {
  batchLineStart: number;
  batchLineEnd: number;
} | null {
  if (batchMicroSegments.length === 0) return null;
  return {
    batchLineStart: batchMicroSegments[0].line_start,
    batchLineEnd: batchMicroSegments[batchMicroSegments.length - 1].line_end,
  };
}

export function tryParseMetaStep2Response(
  response: LlmBrowserResponse,
  batchMicroSegments: MetaStep1MicroSegment[],
  groupId: string,
  videoId: string,
): MetaStep2BatchAnalysis | null {
  const lineRange = resolveBatchLineRange(batchMicroSegments);
  if (!lineRange) return null;

  const { batchLineStart, batchLineEnd } = lineRange;
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) return null;
  if (!parsed.sections.every(section => validateSection(section, batchLineStart, batchLineEnd))) return null;
  if (!validateStep2Quality(parsed.quality)) return null;

  return {
    video_id: typeof parsed.video_id === 'string' ? parsed.video_id : videoId,
    group_id: typeof parsed.group_id === 'string' ? parsed.group_id : groupId,
    sections: parsed.sections as MetaStep2BatchAnalysis['sections'],
    quality: parsed.quality as MetaStep2BatchAnalysis['quality'],
  };
}

function validateStructuredSection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.heading === 'string' && value.heading.trim().length > 0 && isStringArray(value.bullets);
}

function validateFinalSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.overview === 'string' &&
    value.overview.trim().length > 0 &&
    isStringArray(value.key_takeaways) &&
    Array.isArray(value.structured_sections) &&
    value.structured_sections.every(validateStructuredSection)
  );
}

function validateMetadata(value: unknown): boolean {
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

export function tryParseMetaStep3Response(response: LlmBrowserResponse, videoId: string): MetaStep3Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!validateFinalSummary(parsed.final_summary)) return null;
  if (!validateMetadata(parsed.metadata)) return null;
  if (!validateGlobalContext(parsed.global_context)) return null;
  if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) return null;
  if (!parsed.chapters.every(validateChapter)) return null;
  if (!validateStep3Quality(parsed.quality)) return null;

  return {
    video_id: typeof parsed.video_id === 'string' ? parsed.video_id : videoId,
    final_summary: parsed.final_summary as MetaStep3Output['final_summary'],
    metadata: parsed.metadata as MetaStep3Output['metadata'],
    global_context: parsed.global_context as MetaStep3Output['global_context'],
    chapters: parsed.chapters as MetaStep3Output['chapters'],
    quality: parsed.quality as MetaStep3Output['quality'],
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
  step3Output: MetaStep3Output,
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
