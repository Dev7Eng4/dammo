import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import type { SrtBlock } from '../../../../infrastructure/subtitle/srt-utils.js';
import {
  type CelebrityWisdomThumbnailSpec,
  type MetaStep1BeatRole,
  type MetaStep1ChunkDigest,
  type MetaStep2StoryBlock,
  type MetaStep3HeroImagePrompt,
  type MetaStep3Output,
  type MetadataLlmOutput,
} from './metadata.types.js';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

export function extractJsonText(response: LlmBrowserResponse): string {
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

function validateMetadataFields(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  if (typeof value.description !== 'string' || !value.description.trim()) return false;
  if (!validateStringArrayLength(value.tags, 1, 10)) return false;
  return true;
}

function pickOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value;
}

function pickOptionalAlternativeTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(title => title.trim())
    .filter(title => title.length > 0);
}

function pickOptionalThumbnail(value: unknown): CelebrityWisdomThumbnailSpec | undefined {
  if (!isRecord(value)) return undefined;
  return value as unknown as CelebrityWisdomThumbnailSpec;
}

function buildBaseMetadataOutput(parsed: Record<string, unknown>): MetadataLlmOutput {
  const metadata = parsed.metadata as Record<string, unknown>;

  const output: MetadataLlmOutput = {
    detected_niche:
      typeof parsed.detected_niche === 'string' ? parsed.detected_niche.trim() : '',
    metadata: {
      title: String(metadata.title).trim(),
      description: String(metadata.description).trim(),
      tags: (metadata.tags as string[]).map(tag => tag.trim()),
    },
    alternative_titles: pickOptionalAlternativeTitles(parsed.alternative_titles),
  };

  const detectedTopic = pickOptionalTrimmedString(parsed.detected_topic);
  const detectedName = pickOptionalTrimmedString(parsed.detected_name);
  const framing = pickOptionalTrimmedString(parsed.framing);
  const corePromise = pickOptionalTrimmedString(parsed.core_promise);
  if (detectedTopic !== undefined) output.detected_topic = detectedTopic;
  if (detectedName !== undefined) output.detected_name = detectedName;
  if (framing !== undefined) output.framing = framing;
  if (corePromise !== undefined) output.core_promise = corePromise;

  if (typeof parsed.recommended_title_index === 'number' && Number.isFinite(parsed.recommended_title_index)) {
    output.recommended_title_index = parsed.recommended_title_index;
  }

  const thumbnail = pickOptionalThumbnail(parsed.thumbnail);
  if (thumbnail) output.thumbnail = thumbnail;

  const imagePrompt = pickOptionalTrimmedString(parsed.image_generation_prompt);
  if (imagePrompt !== undefined) output.image_generation_prompt = imagePrompt;

  const videoVisualPrompt = pickOptionalTrimmedString(parsed.video_visual_prompt);
  if (videoVisualPrompt !== undefined) output.video_visual_prompt = videoVisualPrompt;

  return output;
}

export function tryParseMetadataResponse(
  response: LlmBrowserResponse,
  options?: { niche?: string },
): MetadataLlmOutput | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, ['metadata'])) return null;
  if (!validateMetadataFields(parsed.metadata)) return null;

  const niche = options?.niche?.trim() || '';
  // Niche-specific meta prompts (celebrity wisdom, drama, …) must return image_generation_prompt.
  if (niche && niche !== 'all') {
    const imagePrompt = pickOptionalTrimmedString(parsed.image_generation_prompt)?.trim() ?? '';
    if (!imagePrompt) return null;
    const output = buildBaseMetadataOutput(parsed);
    output.image_generation_prompt = imagePrompt;
    return output;
  }

  return buildBaseMetadataOutput(parsed);
}
