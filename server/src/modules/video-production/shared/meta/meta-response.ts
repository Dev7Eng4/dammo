import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import type { SrtBlock } from '../../../../infrastructure/subtitle/srt-utils.js';
import type {
  MetaStep1BeatRole,
  MetaStep1ChunkDigest,
  MetaStep2StoryBlock,
  MetaStep3HeroImagePrompt,
  MetaStep3Output,
  MetadataLlmOutput,
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
  batchChunkDigests: MetaStep1ChunkDigest[]
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

export function tryParseMetadataResponse(response: LlmBrowserResponse): MetadataLlmOutput | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
    console.log('🚀 ~ tryParseMetadataResponse ~ parsed:', parsed);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, ['detected_niche', 'metadata'])) return null;
  if (typeof parsed.detected_niche !== 'string' || !parsed.detected_niche.trim()) return null;
  if (!validateMetadataFields(parsed.metadata)) return null;

  const metadata = parsed.metadata as Record<string, unknown>;

  return {
    detected_niche: parsed.detected_niche.trim(),
    metadata: {
      title: String(metadata.title).trim(),
      description: String(metadata.description).trim(),
      tags: (metadata.tags as string[]).map(tag => tag.trim()),
    },
    alternative_titles: (parsed.alternative_titles as string[]).map(title => title.trim()),
  };
}
